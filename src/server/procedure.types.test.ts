import { isNotFound } from '@tanstack/react-router'
import { Result, TaggedError } from 'better-result'
import { Type } from 'typebox'
import { Compile } from 'typebox/compile'
import { describe, expect, expectTypeOf, it } from 'vitest'

import type {
  AuthErrorResponse,
  BusinessErrorResponse,
  ServerErrorResponse,
  ValidationErrorResponse,
} from '#/core/wire'
import type { SessionUser } from '#/server/authorize.server'
import { anonymousOnly, anyone, requireSu, requireUser } from '#/server/authorize.server'
import type { InfraError } from '#/server/infra-error'
import type { Parsed } from '#/server/input.server'
import { noInput, parseWith } from '#/server/input.server'
import {
  business,
  defineMutation,
  defineRead,
  returning,
  toNotFound,
} from '#/server/procedure.server'
import { MEMBER, SU, testContext } from '#/server/testing/test-context'

class Taken extends TaggedError('Taken') {}
class Missing extends TaggedError('Missing')<{ id: string }> {}

const emailSchema = Compile(Type.Object({ email: Type.String() }))
const emailInput = parseWith(emailSchema)

const save = (): Promise<Result<{ id: number }, InfraError | Missing | Taken>> =>
  Promise.resolve(Result.ok({ id: 1 }))
const load = (): Promise<Result<string, InfraError | Missing>> => Promise.resolve(Result.ok('v'))

const taken = () => business('TAKEN', { event: 'x.taken', msg: 'Taken' })
const missing = () => business('MISSING', { event: 'x.missing', msg: 'Missing' })

describe('a mutation wire', () => {
  it('has a member only for what the procedure can produce, and one row per error', async () => {
    expect.hasAssertions()

    const bare = defineMutation({
      auth: anyone,
      event: 'x',
      input: noInput,
      run: () => Promise.resolve(Result.ok()),
      wire: {},
    })
    expectTypeOf<Awaited<ReturnType<typeof bare>>>().toEqualTypeOf<
      ServerErrorResponse | { type: 'SUCCESS' }
    >()

    const full = defineMutation({
      auth: requireUser,
      event: 'x',
      input: emailInput,
      run: save,
      wire: { Missing: missing, Taken: taken },
    })
    expectTypeOf<Awaited<ReturnType<typeof full>>>().toEqualTypeOf<
      | AuthErrorResponse<'You must be logged in to continue.'>
      | BusinessErrorResponse<'MISSING' | 'TAKEN'>
      | ServerErrorResponse
      | ValidationErrorResponse
      | { type: 'SUCCESS'; value: { id: number } }
    >()

    defineMutation({
      auth: anyone,
      event: 'x',
      input: noInput,
      run: save,
      // @ts-expect-error: no row for Taken
      wire: { Missing: missing },
    })
    defineMutation({
      auth: anyone,
      event: 'x',
      input: noInput,
      run: save,
      // @ts-expect-error: the boundary answers InfraError, never a row
      wire: { InfraError: missing, Missing: missing, Taken: taken },
    })
    defineMutation({
      auth: anyone,
      event: 'x',
      input: noInput,
      run: load,
      // @ts-expect-error: the workflow cannot raise Taken
      wire: { Missing: missing, Taken: taken },
    })

    await expect(bare({ context: testContext(null) })).resolves.toStrictEqual({ type: 'SUCCESS' })
  })

  it('answers AUTH_ERROR from a row, and no other value', async () => {
    expect.hasAssertions()

    const legacy = defineMutation({
      auth: anyone,
      event: 'x',
      input: noInput,
      run: load,
      wire: { Missing: () => returning({ type: 'AUTH_ERROR' }) },
    })
    expectTypeOf<Awaited<ReturnType<typeof legacy>>>().toEqualTypeOf<
      ServerErrorResponse | { readonly type: 'AUTH_ERROR' } | { type: 'SUCCESS'; value: string }
    >()

    defineMutation({
      auth: anyone,
      event: 'x',
      input: noInput,
      run: load,
      // @ts-expect-error: a mutation answers a domain error with a code or AUTH_ERROR
      wire: { Missing: () => returning('v') },
    })

    await expect(legacy({ context: testContext(null) })).resolves.toStrictEqual({
      type: 'SUCCESS',
      value: 'v',
    })
  })
})

describe('a read wire', () => {
  it('is the value, plus any value a row answers, and never a business code', async () => {
    expect.hasAssertions()

    const plain = defineRead({
      auth: requireSu,
      event: 'x',
      input: noInput,
      run: load,
      wire: { Missing: () => toNotFound() },
    })
    expectTypeOf<Awaited<ReturnType<typeof plain>>>().toEqualTypeOf<string>()

    const legacy = defineRead({
      auth: anyone,
      event: 'x',
      input: noInput,
      run: load,
      wire: { Missing: () => returning({ type: 'AUTH_ERROR' }) },
    })
    expectTypeOf<Awaited<ReturnType<typeof legacy>>>().toEqualTypeOf<
      string | { readonly type: 'AUTH_ERROR' }
    >()

    defineRead({
      auth: anyone,
      event: 'x',
      input: noInput,
      run: load,
      // @ts-expect-error: a read throws or returns, it has no BUSINESS_ERROR
      wire: { Missing: missing },
    })

    await expect(plain({ context: testContext(MEMBER) })).rejects.toSatisfy(isNotFound)
  })
})

describe('a policy', () => {
  it('narrows the context the workflow receives', async () => {
    expect.hasAssertions()

    defineRead({
      auth: requireUser,
      event: 'x',
      input: noInput,
      run: ({ user }) => {
        expectTypeOf(user).toEqualTypeOf<SessionUser>()
        return load()
      },
      wire: { Missing: () => toNotFound() },
    })
    defineMutation({
      auth: anonymousOnly,
      event: 'x',
      input: emailInput,
      run: ({ user }, input) => {
        expectTypeOf(user).toEqualTypeOf<null>()
        expectTypeOf(input).toEqualTypeOf<Parsed<typeof emailInput>>()
        return save()
      },
      wire: {
        Missing: (error, { email }) => {
          expectTypeOf(error.id).toEqualTypeOf<string>()
          expectTypeOf(email).toEqualTypeOf<string>()
          return missing()
        },
        Taken: taken,
      },
    })
    const suOnly = defineRead({
      auth: requireSu,
      event: 'x',
      input: noInput,
      run: ({ user }) => {
        expectTypeOf(user.role).toEqualTypeOf<'su'>()
        return Promise.resolve(Result.ok(user.role))
      },
      wire: {},
    })

    await expect(suOnly({ context: testContext(SU) })).resolves.toBe('su')
  })
})
