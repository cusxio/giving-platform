import { createHash } from 'node:crypto'
import { Writable } from 'node:stream'

import type { getGlobalStartContext } from '@tanstack/react-start'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'

import { addDays, now } from '#/core/date'
import type * as AuthServer from '#/modules/auth/server'
import type * as Envvars from '#/server/env.server'
import { MEMBER } from '#/server/testing/test-context'
import { testDeps } from '#/server/testing/test-deps'

import { createTokenHasher } from './crypto.server'
import type { Deps } from './deps.server'
import type { RequestContext } from './request-context.server'

const io = vi.hoisted(() => ({
  check: { session: null, user: null, userSettings: null } as AuthServer.SessionCheck,
  cookie: undefined as string | undefined,
  logs: [] as Record<string, unknown>[],
  verified: [] as { cookie: string; logger: unknown }[],
}))

vi.mock<typeof Envvars>(import('#/server/env.server'), () => ({
  BASE_URL: 'https://app.give.test',
  CRON_SECRET: undefined,
  DATABASE_URL: 'postgres://user:pass@db.give.test/db',
  EGHL_PASSWORD: 'secret-password',
  EGHL_SERVICE_ID: 'service-123',
  EGHL_URL: 'https://eghl.test/pay',
  MAIL: { provider: 'test', rootDomain: undefined },
  SESSION_SECRET: 'test-session-secret',
}))

vi.mock(import('@tanstack/react-start/server'), () => ({ getCookie: () => io.cookie }))

vi.mock(import('#/server/logger.server'), async () => {
  const { pino: createLogger } = await import('pino')
  const sink = new Writable({
    write(chunk: Buffer, _encoding, done) {
      io.logs.push(JSON.parse(chunk.toString()) as Record<string, unknown>)
      done()
    },
  })
  return { logger: createLogger(sink) }
})

vi.mock<typeof AuthServer>(import('#/modules/auth/server'), async (importOriginal) => ({
  ...(await importOriginal()),
  verifySessionCookie: (deps, cookie) => {
    io.verified.push({ cookie, logger: deps.logger })
    return Promise.resolve(io.check)
  },
}))

const { logger: rootLogger } = await import('./logger.server')
const { requestContext } = await import('./request-context.server')

const COOKIE = `${'session'.padEnd(21, '0')}.${'token'.padEnd(21, '0')}`

const sha256 = (parts: string[]) =>
  createHash('sha256')
    .update(['secret-password', ...parts].join(''))
    .digest('hex')

function signedReturn() {
  const fields = {
    Amount: '1.00',
    CurrencyCode: 'MYR',
    OrderNumber: 'liveReply00000000001',
    Param6: '',
    Param7: '',
    PaymentID: 'liveReply00000000001',
    PymtMethod: 'ANY',
    ServiceID: 'service-123',
    TransactionType: 'SALE',
    TxnID: '',
    TxnMessage: 'Buyer cancelled',
    TxnStatus: '1',
  }
  const signed = [
    fields.TxnID,
    fields.ServiceID,
    fields.PaymentID,
    fields.TxnStatus,
    fields.Amount,
    fields.CurrencyCode,
    '',
  ]
  return new URLSearchParams({
    ...fields,
    HashValue: sha256(signed),
    HashValue2: sha256([...signed, fields.OrderNumber, fields.Param6, fields.Param7]),
  }).toString()
}
const ANONYMOUS: AuthServer.SessionCheck = { session: null, user: null, userSettings: null }
const SIGNED_IN: AuthServer.SessionCheck = {
  session: { expiresAt: addDays(now(), 20), id: 'session'.padEnd(21, '0'), tokenHash: 'hash' },
  user: { ...MEMBER, id: 42 },
  userSettings: { privacyMode: true, userId: 42 },
}

async function handle(cookie?: string) {
  io.cookie = cookie
  io.logs = []
  io.verified = []
  const { server } = requestContext.options
  if (server === undefined) {
    throw new TypeError('requestContext has no server function')
  }
  let context: RequestContext | undefined
  await server({
    context: {},
    handlerType: 'router',
    next: (options?: { context?: RequestContext }) => {
      context = options?.context
      return {
        context,
        pathname: '/',
        request: new Request('https://app.give.test/'),
        response: new Response(),
      }
    },
    pathname: '/',
    request: new Request('https://app.give.test/'),
  } as never)
  if (context === undefined) {
    throw new TypeError('requestContext did not call next with a context')
  }
  return { context, logs: io.logs, verified: io.verified }
}

type GlobalContext = NonNullable<ReturnType<typeof getGlobalStartContext>>
// Each compiles only because the other half of the pair is narrowed by the null test.
const sessionIdOf = (context: GlobalContext) => (context.user === null ? null : context.session.id)
const userIdOf = (context: RequestContext) => (context.session === null ? null : context.user.id)
const privacyOf = (context: RequestContext) =>
  context.user === null ? null : context.userSettings.privacyMode

describe('the request context middleware', () => {
  it('treats a request without a cookie as anonymous without verifying anything', async () => {
    expect.hasAssertions()

    io.check = SIGNED_IN
    const { context, verified } = await handle()

    expect(context).toMatchObject(ANONYMOUS)
    expect(verified).toStrictEqual([])
  })

  it('verifies the session cookie with the root logger and passes the result through', async () => {
    expect.hasAssertions()

    io.check = SIGNED_IN
    const { context, verified } = await handle(COOKIE)

    expect(verified).toHaveLength(1)
    expect(verified[0]?.cookie).toBe(COOKIE)
    expect(verified[0]?.logger).toBe(rootLogger)
    expect(context).toMatchObject(SIGNED_IN)
  })

  it('leaves a rejected cookie anonymous', async () => {
    expect.hasAssertions()

    io.check = ANONYMOUS
    const { context } = await handle(COOKIE)

    expect(context).toMatchObject(ANONYMOUS)
  })

  it('scopes the logger to the signed-in user', async () => {
    expect.hasAssertions()

    io.check = SIGNED_IN
    const { context } = await handle(COOKIE)
    io.logs = []
    context.deps.logger.info({ event: 'probe' }, 'probe')

    expect(io.logs).toContainEqual(expect.objectContaining({ event: 'probe', user_id: 42 }))
  })

  it("scopes the gateway adapter's events to the signed-in user", async () => {
    expect.hasAssertions()

    io.check = SIGNED_IN
    const { context } = await handle(COOKIE)
    io.logs = []
    await context.deps.eghl.readReply(
      new Request(`https://app.give.test/api/eghl/return?${signedReturn()}`),
    )

    expect(io.logs).toContainEqual(
      expect.objectContaining({ event: 'eghl.reply.verified', user_id: 42 }),
    )
  })

  it('builds deps from the composition root', async () => {
    expect.hasAssertions()

    const { context } = await handle()

    expect(context.deps.config).toStrictEqual({
      cronSecret: undefined,
      eghl: {
        baseUrl: 'https://app.give.test',
        password: 'secret-password',
        serviceId: 'service-123',
        url: 'https://eghl.test/pay',
      },
      mail: { provider: 'test', rootDomain: undefined },
    })
    expect(context.deps.hashToken('raw')).toBe(createTokenHasher('test-session-secret')('raw'))
  })

  it('types context.deps on every handler through Register', () => {
    expect.hasAssertions()

    expectTypeOf<GlobalContext['deps']>().not.toBeAny()
    expectTypeOf<GlobalContext['deps']>().toEqualTypeOf<Deps>()
    expectTypeOf<GlobalContext['user']>().toEqualTypeOf<RequestContext['user']>()

    expect(requestContext.options.server).toBeTypeOf('function')
  })

  it('pairs the session with the user and settings, so a null test on one narrows all', () => {
    expect.hasAssertions()

    expectTypeOf(sessionIdOf).returns.toEqualTypeOf<null | string>()
    expectTypeOf(userIdOf).returns.toEqualTypeOf<null | number>()
    expectTypeOf(privacyOf).returns.toEqualTypeOf<boolean | null>()
    // @ts-expect-error a session without a user is not a request context
    const unpaired: RequestContext = {
      deps: testDeps(),
      session: SIGNED_IN.session,
      user: null,
      userSettings: null,
    }

    expect(unpaired.user).toBeNull()
  })
})
