import { SpanStatusCode } from '@opentelemetry/api'
import { isNotFound, isRedirect, notFound } from '@tanstack/react-router'
import { Panic, Result, TaggedError } from 'better-result'
import { DrizzleQueryError } from 'drizzle-orm'
import { Type } from 'typebox'
import { Compile } from 'typebox/compile'
import { describe, expect, it } from 'vitest'

import type { Policy, Refusal } from '#/server/authorize.server'
import { anonymousOnly, anyone, requireSu, requireUser } from '#/server/authorize.server'
import { InfraError, infra } from '#/server/infra-error'
import { noInput, parseWith } from '#/server/input.server'
import {
  business,
  defineMutation,
  defineRead,
  returning,
  toNotFound,
} from '#/server/procedure.server'
import type { RequestContext } from '#/server/request-context.server'
import { recordingLogger } from '#/server/testing/recording-logger'
import type { Settled } from '#/server/testing/spans'
import { inRequestSpan } from '#/server/testing/spans'
import { MEMBER, SU, testContext } from '#/server/testing/test-context'

class InvalidCode extends TaggedError('InvalidCode') {}
class Missing extends TaggedError('Missing')<{ id: string }> {}

const emailSchema = Compile(Type.Object({ email: Type.String({ format: 'email' }) }))
const emailInput = parseWith(emailSchema, { lowercase: ['email'], trim: ['email'] })

const DEBUG = 20
const INFO = 30
const WARN = 40
const ERROR = 50

type Invoke = (invocation: { context: RequestContext; data?: unknown }) => Promise<unknown>

/** Calls an action inside a request span, the way a server function runs. */
async function call(action: Invoke, user: RequestContext['user'], data?: unknown) {
  const { events, logger } = recordingLogger()
  const { settled, span } = await inRequestSpan(() =>
    action({ context: testContext(user, { logger }), data }),
  )
  return { events, settled, span }
}

const answered = (value: unknown) => ({ status: 'fulfilled', value })
const thrownBy = (settled: Settled<unknown>): unknown =>
  settled.status === 'rejected' ? settled.reason : undefined
const redirectedTo = (settled: Settled<unknown>): unknown => {
  const thrown = thrownBy(settled)
  return isRedirect(thrown) ? thrown.options.to : undefined
}

const driverError = Object.assign(new Error('connection terminated'), { name: 'NeonDbError' })
const failedQuery = () => Promise.resolve(Result.err(infra('q.find', driverError)))

describe('a mutation', () => {
  it('answers SUCCESS, with the value when there is one', async () => {
    expect.hasAssertions()

    const nothing = defineMutation({
      auth: anyone,
      event: 'm.x',
      input: noInput,
      run: () => Promise.resolve(Result.ok()),
      wire: {},
    })
    const something = defineMutation({
      auth: anyone,
      event: 'm.x',
      input: noInput,
      run: () => Promise.resolve(Result.ok({ id: 7 })),
      wire: {},
    })

    const empty = await call(nothing, null)
    const full = await call(something, null)

    expect(empty.settled).toStrictEqual(answered({ type: 'SUCCESS' }))
    expect(full.settled).toStrictEqual(answered({ type: 'SUCCESS', value: { id: 7 } }))
  })

  it('passes the normalized input to the workflow', async () => {
    expect.hasAssertions()

    const action = defineMutation({
      auth: anyone,
      event: 'm.x',
      input: emailInput,
      run: (_ctx, { email }) => Promise.resolve(Result.ok(email)),
      wire: {},
    })

    const { settled } = await call(action, null, { email: '  A@B.co ' })
    expect(settled).toStrictEqual(answered({ type: 'SUCCESS', value: 'a@b.co' }))
  })

  it('answers AUTH_ERROR to a signed-out or forbidden caller, without running', async () => {
    expect.hasAssertions()

    const ran: string[] = []
    const run = () => {
      ran.push('run')
      return Promise.resolve(Result.ok())
    }
    const signedIn = defineMutation({
      auth: requireUser,
      event: 'm.x',
      input: noInput,
      run,
      wire: {},
    })
    const suOnly = defineMutation({ auth: requireSu, event: 'm.x', input: noInput, run, wire: {} })

    for (const [action, user] of [
      [signedIn, null],
      [suOnly, null],
      [suOnly, MEMBER],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop
      const { events, settled } = await call(action, user)
      expect(settled).toStrictEqual(
        answered({ message: 'You must be logged in to continue.', type: 'AUTH_ERROR' }),
      )
      expect(events).toMatchObject([{ event: 'm.x.unauthorized', level: WARN }])
    }
    expect(ran).toStrictEqual([])
  })

  it('redirects a signed-in caller of an anonymous-only call home', async () => {
    expect.hasAssertions()

    const action = defineMutation({
      auth: anonymousOnly,
      event: 'm.x',
      input: noInput,
      run: () => Promise.resolve(Result.ok()),
      wire: {},
    })
    const { events, settled } = await call(action, MEMBER)

    expect(redirectedTo(settled)).toBe('/')
    expect(events).toMatchObject([{ event: 'm.x.redirected', level: INFO, user_id: MEMBER.id }])
  })

  it('answers VALIDATION_ERROR to a malformed body, never a TypeError', async () => {
    expect.hasAssertions()

    const action = defineMutation({
      auth: anyone,
      event: 'm.x',
      input: emailInput,
      run: () => Promise.resolve(Result.ok()),
      wire: {},
    })

    for (const data of [undefined, null, 42, 'a@b.co', [], {}, { email: 5 }, { email: 'nope' }]) {
      // oxlint-disable-next-line no-await-in-loop
      const { events, settled } = await call(action, null, data)
      expect(settled).toMatchObject(answered({ type: 'VALIDATION_ERROR' }))
      const { errors } = (settled as { value: { errors: unknown[] } }).value
      expect(errors.length).toBeGreaterThan(0)
      expect(events).toMatchObject([
        { event: 'm.x.validation_failed', issues: errors, level: WARN },
      ])
    }
  })

  it('answers a domain error with its row and logs the row', async () => {
    expect.hasAssertions()

    const action = defineMutation({
      auth: anyone,
      event: 'm.x',
      input: emailInput,
      run: () => Promise.resolve(Result.err(new InvalidCode())),
      wire: {
        InvalidCode: (_error, { email }) =>
          business(
            'INVALID_OR_EXPIRED_OTP',
            { event: 'm.x.invalid', fields: { email }, level: 'info', msg: 'Invalid code' },
            'Try again',
          ),
      },
    })
    const { events, settled } = await call(action, null, { email: 'A@B.co' })

    expect(settled).toStrictEqual(
      answered({
        error: { code: 'INVALID_OR_EXPIRED_OTP', message: 'Try again' },
        type: 'BUSINESS_ERROR',
      }),
    )
    expect(events).toMatchObject([
      { email: 'a@b.co', event: 'm.x.invalid', level: INFO, msg: 'Invalid code' },
    ])
  })

  it('answers an InfraError with SERVER_ERROR, logs it once and fails the request span', async () => {
    expect.hasAssertions()

    const action = defineMutation({
      auth: anyone,
      event: 'm.x',
      input: noInput,
      run: failedQuery,
      wire: {},
    })
    const { events, settled, span } = await call(action, null)

    expect(settled).toStrictEqual(answered({ type: 'SERVER_ERROR' }))
    expect(events).toMatchObject([
      {
        'error.type': 'NeonDbError',
        err: { message: 'connection terminated' },
        event: 'm.x.failed',
        level: ERROR,
        msg: 'q.find failed',
        op: 'q.find',
      },
    ])
    expect(span.status).toStrictEqual({ code: SpanStatusCode.ERROR, message: 'q.find failed' })
    expect(span.attributes['error.type']).toBe('NeonDbError')
    expect(span.events).toMatchObject([
      { attributes: { 'exception.message': 'connection terminated' }, name: 'exception' },
    ])
  })

  it('labels a statement that returned no row by its reason', async () => {
    expect.hasAssertions()

    const noRow = new InfraError({
      cause: undefined,
      message: 'q.insert returned no row',
      op: 'q.insert',
      reason: 'no-row',
    })
    const action = defineMutation({
      auth: anyone,
      event: 'm.x',
      input: noInput,
      run: () => Promise.resolve(Result.err(noRow)),
      wire: {},
    })
    const { events } = await call(action, null)

    expect(events).toMatchObject([{ 'error.type': 'no-row', event: 'm.x.failed', op: 'q.insert' }])
  })

  it('leaves the request span alone on every other outcome', async () => {
    expect.hasAssertions()

    const action = defineMutation({
      auth: requireUser,
      event: 'm.x',
      input: emailInput,
      run: () => Promise.resolve(Result.err(new InvalidCode())),
      wire: { InvalidCode: () => business('X', { event: 'm.x.invalid', msg: 'Invalid' }) },
    })

    for (const [user, data] of [
      [null, {}],
      [MEMBER, {}],
      [MEMBER, { email: 'a@b.co' }],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop
      const { span } = await call(action, user, data)
      expect(span.status.code).toBe(SpanStatusCode.UNSET)
      expect(span.events).toStrictEqual([])
    }
  })
})

describe('a logged failure', () => {
  const email = 'donor@give.test'
  const duplicate = Object.assign(
    new Error(`duplicate key value violates unique constraint, value "${email}"`),
    { code: '23505', detail: `Key (email)=(${email}) already exists.`, name: 'NeonDbError' },
  )
  const statement = 'insert into "users" ("email") values ($1)'
  const wrapped = new DrizzleQueryError(statement, [email], duplicate)

  it('names the driver error, its code and the SQL, never a parameter or a value', async () => {
    expect.hasAssertions()

    const action = defineMutation({
      auth: anyone,
      event: 'm.x',
      input: noInput,
      run: () => Promise.resolve(Result.err(infra('users.insert', wrapped))),
      wire: {},
    })
    const { events } = await call(action, null)

    expect(events).toMatchObject([
      {
        'error.type': 'NeonDbError',
        err: { code: '23505', query: statement, type: 'NeonDbError' },
        event: 'm.x.failed',
        op: 'users.insert',
      },
    ])
    expect(JSON.stringify(events)).not.toContain(email)
  })

  it('records the same view on the request span', async () => {
    expect.hasAssertions()

    const action = defineMutation({
      auth: anyone,
      event: 'm.x',
      input: noInput,
      run: () => Promise.resolve(Result.err(infra('users.insert', wrapped))),
      wire: {},
    })
    const { span } = await call(action, null)

    expect(span.events).toMatchObject([
      { attributes: { 'exception.type': 'NeonDbError' }, name: 'exception' },
    ])
    expect(JSON.stringify(span.events)).not.toContain(email)
  })

  it('redacts a defect that carries a failed statement in its cause', async () => {
    expect.hasAssertions()

    const action = defineRead({
      auth: anyone,
      event: 'r.x',
      input: noInput,
      run: () =>
        Result.gen(async function* workflow() {
          yield* Result.await(Promise.resolve(Result.ok(1)))
          throw wrapped
        }),
      wire: {},
    })
    const { events, settled, span } = await call(action, null)

    expect(Panic.is(thrownBy(settled))).toBe(true)
    expect(events).toMatchObject([
      { 'error.type': 'Panic', err: { type: 'Panic' }, event: 'r.x.defect', level: ERROR },
    ])
    expect(JSON.stringify(events)).not.toContain(email)
    expect(JSON.stringify(span.events)).not.toContain(email)
  })

  it('names the error a transaction rolled back for when the rollback failed', async () => {
    expect.hasAssertions()

    const failedRollback = new InfraError({
      cause: new Error('rollback failed'),
      message: 'db.transaction failed',
      op: 'db.transaction',
      reason: 'failed',
      rejected: new InvalidCode(),
    })
    const action = defineMutation({
      auth: anyone,
      event: 'm.x',
      input: noInput,
      run: () => Promise.resolve(Result.err(failedRollback)),
      wire: {},
    })
    const { events } = await call(action, null)

    expect(events).toMatchObject([
      { event: 'm.x.failed', op: 'db.transaction', rejected: 'InvalidCode' },
    ])
  })
})

const read = <C, PE extends Refusal>(
  auth: Policy<C, PE>,
  run: () => Promise<Result<string, InfraError | Missing>> = () => Promise.resolve(Result.ok('v')),
) =>
  defineRead({
    auth,
    event: 'r.x',
    input: noInput,
    run,
    wire: {
      Missing: (error) =>
        toNotFound({ event: 'r.x.not_found', fields: { id: error.id }, msg: 'Not found' }),
    },
  })

describe('a read', () => {
  it('answers with the bare value', async () => {
    expect.hasAssertions()

    const open = await call(read(anyone), null)
    const suOnly = await call(read(requireSu), SU)

    expect(open.settled).toStrictEqual(answered('v'))
    expect(suOnly.settled).toStrictEqual(answered('v'))
  })

  it('redirects a signed-out caller to login', async () => {
    expect.hasAssertions()

    const { events, settled } = await call(read(requireUser), null)

    expect(redirectedTo(settled)).toBe('/auth/login')
    expect(events).toMatchObject([{ event: 'r.x.unauthorized', level: DEBUG }])
  })

  it('hides itself from a caller without the role', async () => {
    expect.hasAssertions()

    const { events, settled } = await call(read(requireSu), MEMBER)

    expect(isNotFound(thrownBy(settled))).toBe(true)
    expect(events).toMatchObject([{ event: 'r.x.unauthorized', level: DEBUG }])
  })

  it('redirects a signed-in caller of an anonymous-only read home', async () => {
    expect.hasAssertions()

    const { settled } = await call(read(anonymousOnly), MEMBER)

    expect(redirectedTo(settled)).toBe('/')
  })

  it('throws a generic error for invalid input', async () => {
    expect.hasAssertions()

    const action = defineRead({
      auth: anyone,
      event: 'r.x',
      input: emailInput,
      run: () => Promise.resolve(Result.ok('v')),
      wire: {},
    })
    const { events, settled } = await call(action, null, { email: 5 })

    expect(thrownBy(settled)).toStrictEqual(new Error('Invalid input'))
    expect(events).toMatchObject([{ event: 'r.x.validation_failed', level: WARN }])
  })

  it('answers a domain error with its row', async () => {
    expect.hasAssertions()

    const gone = await call(
      read(anyone, () => Promise.resolve(Result.err(new Missing({ id: 't1' })))),
      null,
    )
    expect(isNotFound(thrownBy(gone.settled))).toBe(true)
    expect(gone.events).toMatchObject([{ event: 'r.x.not_found', id: 't1', level: WARN }])

    const legacy = defineRead({
      auth: anyone,
      event: 'r.x',
      input: noInput,
      run: () => Promise.resolve(Result.err(new Missing({ id: 't1' }))),
      wire: { Missing: () => returning({ type: 'AUTH_ERROR' }) },
    })
    const { events, settled } = await call(legacy, null)
    expect(settled).toStrictEqual(answered({ type: 'AUTH_ERROR' }))
    expect(events).toStrictEqual([])
  })

  it('throws a generic error for an InfraError, logs the cause once and fails the span', async () => {
    expect.hasAssertions()

    const { events, settled, span } = await call(read(anyone, failedQuery), null)

    expect(thrownBy(settled)).toStrictEqual(new Error('Internal Server Error'))
    expect(events).toMatchObject([
      {
        'error.type': 'NeonDbError',
        err: { message: 'connection terminated' },
        event: 'r.x.failed',
        level: ERROR,
        op: 'q.find',
      },
    ])
    expect(span.status.code).toBe(SpanStatusCode.ERROR)
    expect(span.events).toMatchObject([
      { attributes: { 'exception.message': 'connection terminated' }, name: 'exception' },
    ])
  })
})

describe('a throw from a workflow', () => {
  it('is a defect: logged, recorded on the span, and rethrown as the same object', async () => {
    expect.hasAssertions()

    const bug = new TypeError('bug')
    const action = defineMutation({
      auth: anyone,
      event: 'm.x',
      input: noInput,
      run: () => Promise.reject(bug),
      wire: {},
    })
    const { events, settled, span } = await call(action, null)

    expect(thrownBy(settled)).toBe(bug)
    expect(events).toMatchObject([{ err: { message: 'bug' }, event: 'm.x.defect', level: ERROR }])
    expect(span.status.code).toBe(SpanStatusCode.ERROR)
    expect(span.attributes['error.type']).toBe('TypeError')
  })

  it('is a defect when Result.gen turns it into a Panic', async () => {
    expect.hasAssertions()

    const action = defineRead({
      auth: anyone,
      event: 'r.x',
      input: noInput,
      run: () =>
        Result.gen(async function* workflow() {
          yield* Result.await(Promise.resolve(Result.ok(1)))
          throw new Error('inside gen')
        }),
      wire: {},
    })
    const { events, settled } = await call(action, null)

    expect(Panic.is(thrownBy(settled))).toBe(true)
    expect(events).toMatchObject([{ event: 'r.x.defect', level: ERROR }])
  })

  it('passes a redirect or notFound through unlogged', async () => {
    expect.hasAssertions()

    const hidden = notFound()
    const action = defineRead({
      auth: anyone,
      event: 'r.x',
      input: noInput,
      run: () => {
        throw hidden
      },
      wire: {},
    })
    const { events, settled, span } = await call(action, null)

    expect(thrownBy(settled)).toBe(hidden)
    expect(events).toStrictEqual([])
    expect(span.status.code).toBe(SpanStatusCode.UNSET)
  })
})
