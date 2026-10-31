import { pino } from 'pino'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'

import type {
  BusinessErrorResponse,
  ServerErrorResponse,
  ValidationErrorResponse,
} from '#/core/wire'
import { activateUser, findUserByEmail, upsertGuestUser } from '#/modules/account/server'
import type { QueryResult } from '#/server/db.server'
import type { MailMessage } from '#/server/mailer.server'
import type { FakeDb } from '#/server/testing/fake-db'
import { createFakeDb } from '#/server/testing/fake-db'
import { MEMBER, testContext } from '#/server/testing/test-context'
import { testDeps } from '#/server/testing/test-deps'

import type { requestOtp, verifyOtp } from './auth.functions'
import { recordAttempt, resetAttempts } from './rate-limits.repository.server'
import type { RequestOtpInput } from './request-otp.server'
import { requestOtpAction } from './request-otp.server'
import { createSession } from './sessions.repository.server'
import { claimTokenIfUnused, createToken, findToken } from './tokens.repository.server'
import type { VerifyOtpInput } from './verify-otp.server'
import { verifyOtpAction } from './verify-otp.server'

const io = vi.hoisted(() => ({
  request: new Request('https://app.give.test/'),
  setCookies: [] as string[],
}))

vi.mock(import('@tanstack/react-start/server'), () => ({
  getRequest: () => io.request,
  setResponseHeader: (name, value) => {
    if (name === 'Set-Cookie') {
      io.setCookies.push(...[value].flat())
    }
  },
}))

const EMAIL = 'donor@example.com'
/** Vercel sets x-real-ip on every request; most tests arrive from this address. */
const ADDRESS = '198.51.100.1'

type UserRow = NonNullable<QueryResult<typeof findUserByEmail>>
type TokenRow = NonNullable<QueryResult<typeof findToken>>
type Status = UserRow['status']

interface LogLine {
  readonly event?: string
  readonly level: number
  readonly reason?: string
}

function fail(): never {
  throw new Error('connection terminated')
}

function userRow(email: string, id: number, status: Status): UserRow {
  return {
    createdAt: new Date('2025-01-01T00:00:00Z'),
    email,
    emailVerifiedAt: null,
    firstName: null,
    id,
    journey: null,
    lastName: null,
    role: 'user',
    status,
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  }
}

/** Later calls arrive with Vercel's client-address header. */
function fromAddress(ip: string) {
  io.request = new Request('https://app.give.test/', { headers: { 'x-real-ip': ip } })
}

function setup(existing?: Status) {
  fromAddress(ADDRESS)
  const users = new Map<UserRow['email'], UserRow>()
  if (existing) {
    users.set(EMAIL, userRow(EMAIL, 1, existing))
  }
  const tokens: TokenRow[] = []
  const sentEmails: MailMessage[] = []
  const events: LogLine[] = []
  const attempts = new Map<string, number>()

  const db = createFakeDb()
    .on(findUserByEmail, (email) => {
      const user = users.get(email)
      return user ? { ...user } : null
    })
    .on(upsertGuestUser, ({ email }) => {
      const user = userRow(email, users.size + 1, 'guest')
      users.set(email, user)
      return { ...user }
    })
    .on(activateUser, (id) => {
      for (const user of users.values()) {
        if (user.id === id) {
          user.status = 'active'
        }
      }
    })
    .on(createToken, (userId, tokenHash, mode) => {
      tokens.unshift({
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 5 * 60_000),
        id: tokens.length + 1,
        mode,
        tokenHash,
        usedAt: null,
        userId,
      })
    })
    .on(findToken, (userId) => tokens.find((t) => t.userId === userId && t.usedAt === null) ?? null)
    .on(claimTokenIfUnused, (id) => {
      const token = tokens.find((t) => t.id === id && t.usedAt === null)
      if (token) {
        token.usedAt = new Date()
      }
      return token !== undefined
    })
    .on(createSession, (input) => ({
      ...input,
      createdAt: new Date(),
      id: `session-${input.userId}`.padEnd(21, '0'),
      updatedAt: new Date(),
    }))
    .on(recordAttempt, (identifier, action, _windowSeconds, currentTime) => {
      const key = `${action}:${identifier}`
      const attemptCount = (attempts.get(key) ?? 0) + 1
      attempts.set(key, attemptCount)
      return {
        action,
        attemptCount,
        id: 1,
        identifier,
        lastAttemptAt: currentTime,
        windowStartedAt: currentTime,
      }
    })
    .on(resetAttempts, (identifier, action) => {
      attempts.delete(`${action}:${identifier}`)
    })

  const logger = pino(
    { level: 'debug' },
    {
      write: (line: string) => {
        events.push(JSON.parse(line) as LogLine)
      },
    },
  )

  const deps = testDeps({
    db,
    logger,
    mailer: {
      send: (message) => {
        sentEmails.push(message)
        return Promise.resolve()
      },
    },
  })

  return {
    attempts,
    db,
    deps,
    events,
    lastOtp: () => /\b\d{6}\b/u.exec(sentEmails.at(-1)?.text ?? '')?.[0] ?? '',
    sentEmails,
    setStatus: (email: UserRow['email'], status: Status) => {
      const user = users.get(email)
      if (user) {
        user.status = status
      }
    },
    statusOf: (email: UserRow['email']) => users.get(email)?.status,
    tokens,
  }
}

type TestDeps = ReturnType<typeof setup>['deps']

const request = (deps: TestDeps, data: unknown) =>
  requestOtpAction({ context: testContext(null, deps), data })
const verify = (deps: TestDeps, data: unknown) =>
  verifyOtpAction({ context: testContext(null, deps), data })

const success = { type: 'SUCCESS' }
const invalidCode = { error: { code: 'INVALID_OR_EXPIRED_OTP' }, type: 'BUSINESS_ERROR' }

describe('signing up', () => {
  it('creates a guest for a new email and emails it a code', async () => {
    expect.hasAssertions()

    const { deps, sentEmails, statusOf } = setup()

    await expect(request(deps, { email: EMAIL, mode: 'signup' })).resolves.toStrictEqual(success)
    expect(sentEmails.map((e) => e.to)).toStrictEqual([EMAIL])
    expect(statusOf(EMAIL)).toBe('guest')
  })

  it.each(['suspended', 'deleted'] as const)(
    'answers a %s user as if a code was sent, without emailing or reactivating them',
    async (status) => {
      expect.hasAssertions()

      const { deps, sentEmails, statusOf } = setup(status)

      await expect(request(deps, { email: EMAIL, mode: 'signup' })).resolves.toStrictEqual(success)
      expect(sentEmails).toStrictEqual([])
      expect(statusOf(EMAIL)).toBe(status)
    },
  )
})

describe('validating a signup code', () => {
  it('activates a guest and issues a session', async () => {
    expect.hasAssertions()

    const { deps, lastOtp, statusOf } = setup('guest')
    await request(deps, { email: EMAIL, mode: 'signup' })

    await expect(
      verify(deps, { email: EMAIL, mode: 'signup', otp: lastOtp() }),
    ).resolves.toStrictEqual(success)
    expect(statusOf(EMAIL)).toBe('active')
  })

  it.each(['suspended', 'deleted'] as const)(
    'rejects a code issued before the user was %s without activating them',
    async (status) => {
      expect.hasAssertions()

      const { deps, lastOtp, setStatus, statusOf } = setup('guest')
      await request(deps, { email: EMAIL, mode: 'signup' })
      const otp = lastOtp()
      setStatus(EMAIL, status)
      io.setCookies = []

      await expect(verify(deps, { email: EMAIL, mode: 'signup', otp })).resolves.toStrictEqual(
        invalidCode,
      )
      expect(io.setCookies).toStrictEqual([])
      expect(statusOf(EMAIL)).toBe(status)
    },
  )
})

const logged = (events: readonly LogLine[]) =>
  events.map((e) => (e.reason === undefined ? e.event : `${e.event}:${e.reason}`))

describe('requesting a code', () => {
  const notExists = { error: { code: 'NOT_EXISTS' }, type: 'BUSINESS_ERROR' }

  it.each([
    ['login', 'active', { type: 'SUCCESS' }, ['login'], ['attempt', 'success']],
    ['login', 'guest', notExists, [], ['attempt', 'blocked:not_found']],
    ['login', 'suspended', notExists, [], ['attempt', 'blocked:not_found']],
    ['login', 'deleted', notExists, [], ['attempt', 'blocked:not_found']],
    ['login', undefined, notExists, [], ['attempt', 'blocked:not_found']],
    ['signup', undefined, { type: 'SUCCESS' }, ['signup'], ['attempt', 'success']],
    ['signup', 'guest', { type: 'SUCCESS' }, ['signup'], ['attempt', 'success']],
    [
      'signup',
      'active',
      { error: { code: 'ALREADY_EXISTS' }, type: 'BUSINESS_ERROR' },
      [],
      ['attempt', 'blocked:exists'],
    ],
    ['signup', 'suspended', { type: 'SUCCESS' }, [], ['attempt', 'blocked:inactive']],
    ['signup', 'deleted', { type: 'SUCCESS' }, [], ['attempt', 'blocked:inactive']],
  ] as const)(
    '%s for a %s user answers %o and issues %o codes',
    async (mode, status, response, issuedModes, steps) => {
      expect.hasAssertions()

      const { deps, events, sentEmails, tokens } = setup(status)

      await expect(request(deps, { email: EMAIL, mode })).resolves.toStrictEqual(response)
      expect(tokens.map((t) => t.mode)).toStrictEqual(issuedModes)
      expect(sentEmails.map((e) => e.to)).toStrictEqual(issuedModes.map(() => EMAIL))
      expect(logged(events)).toStrictEqual(steps.map((s) => `auth.request_otp.${s}`))
    },
  )

  it('sends the login template with a code the stored hash matches', async () => {
    expect.hasAssertions()

    expectTypeOf<RequestOtpInput>().toEqualTypeOf<{ email: string; mode: 'login' | 'signup' }>()
    expectTypeOf<Awaited<ReturnType<typeof requestOtp>>>().toEqualTypeOf<
      | BusinessErrorResponse<'ALREADY_EXISTS' | 'NOT_EXISTS' | 'RATE_LIMIT_EXCEEDED'>
      | ServerErrorResponse
      | ValidationErrorResponse
      | { type: 'SUCCESS' }
    >()
    const { deps, lastOtp, sentEmails, tokens } = setup('active')
    await request(deps, { email: EMAIL, mode: 'login' })

    expect(sentEmails[0]?.subject).toMatch(/^Login for /u)
    expect(tokens[0]?.tokenHash).toBe(deps.hashToken(lastOtp()))
  })

  it('normalizes the email before limiting and looking it up', async () => {
    expect.hasAssertions()

    const { db, deps } = setup('active')
    await request(deps, { email: '  Donor@Example.COM ', mode: 'login' })

    expect(db.calls.slice(1, 4)).toStrictEqual([
      {
        args: [`${EMAIL}|ip:${ADDRESS}`, 'otp_request', 900, expect.any(Date)],
        name: 'auth.recordAttempt',
      },
      { args: [EMAIL, 'otp_request', 900, expect.any(Date)], name: 'auth.recordAttempt' },
      { args: [EMAIL], name: 'account.findUserByEmail' },
    ])
  })

  it('refuses the sixth request in a window', async () => {
    expect.hasAssertions()

    const { deps, events, sentEmails } = setup('active')
    for (let i = 0; i < 5; i++) {
      // oxlint-disable-next-line no-await-in-loop -- requests arrive one after another
      await request(deps, { email: EMAIL, mode: 'login' })
    }
    const response = await request(deps, { email: EMAIL, mode: 'login' })

    expect(response).toStrictEqual({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again in 15 minutes.',
      },
      type: 'BUSINESS_ERROR',
    })
    expect(sentEmails).toHaveLength(5)
    expect(events.at(-1)).toMatchObject({ event: 'auth.request_otp.rate_limited', level: 40 })
  })

  it('refuses a request from an address over its limit before counting the email', async () => {
    expect.hasAssertions()

    const { attempts, deps, events, sentEmails } = setup('active')
    fromAddress('203.0.113.9')
    attempts.set('otp_request:ip:203.0.113.9', 30)

    await expect(request(deps, { email: EMAIL, mode: 'login' })).resolves.toStrictEqual({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again in 5 minutes.',
      },
      type: 'BUSINESS_ERROR',
    })
    expect(sentEmails).toStrictEqual([])
    expect(attempts.has(`otp_request:${EMAIL}`)).toBe(false)
    expect(events.at(-1)).toMatchObject({
      email: EMAIL,
      event: 'auth.request_otp.rate_limited',
      ip: '203.0.113.9',
      level: 40,
    })
  })

  it('counts each request against its address, the email from that address, and the email', async () => {
    expect.hasAssertions()

    const { attempts, deps, events, sentEmails } = setup('active')
    fromAddress('203.0.113.9')

    await expect(request(deps, { email: EMAIL, mode: 'login' })).resolves.toStrictEqual(success)
    expect(sentEmails).toHaveLength(1)
    expect(Object.fromEntries(attempts)).toStrictEqual({
      'otp_request:donor@example.com': 1,
      'otp_request:donor@example.com|ip:203.0.113.9': 1,
      'otp_request:ip:203.0.113.9': 1,
    })
    expect(events.find((e) => e.event === 'auth.request_otp.rate_limited')).toBeUndefined()
  })

  it('rejects an invalid email without touching the database', async () => {
    expect.hasAssertions()

    const { db, deps, events } = setup()

    await expect(request(deps, { email: 'not-an-email', mode: 'login' })).resolves.toStrictEqual({
      errors: [{ message: 'must match format "email"', path: '/email' }],
      type: 'VALIDATION_ERROR',
    })
    expect(db.calls).toStrictEqual([])
    expect(logged(events)).toStrictEqual(['auth.request_otp.validation_failed'])
  })

  it('redirects a signed-in caller home', async () => {
    expect.hasAssertions()

    const { db, deps, events } = setup('active')

    await expect(
      requestOtpAction({
        context: testContext(MEMBER, deps),
        data: { email: EMAIL, mode: 'login' },
      }),
    ).rejects.toMatchObject({ options: { to: '/' } })
    expect(db.calls).toStrictEqual([])
    expect(logged(events)).toStrictEqual(['auth.request_otp.redirected'])
  })

  it.each([
    ['the rate limit check fails', (db: FakeDb) => db.on(recordAttempt, fail)],
    ['the user lookup fails', (db: FakeDb) => db.on(findUserByEmail, fail)],
    ['the token insert fails', (db: FakeDb) => db.on(createToken, fail)],
  ] as const)('is a server error when %s', async (_case, breakDb) => {
    expect.hasAssertions()

    const { db, deps, events } = setup('active')
    breakDb(db)

    await expect(request(deps, { email: EMAIL, mode: 'login' })).resolves.toStrictEqual({
      type: 'SERVER_ERROR',
    })
    expect(events.at(-1)).toMatchObject({
      'error.type': 'Error',
      event: 'auth.request_otp.failed',
      level: 50,
      op: db.calls.at(-1)?.name,
    })
  })

  it('is a server error when the email cannot be sent', async () => {
    expect.hasAssertions()

    const { deps, events } = setup('active')
    const failing = { ...deps, mailer: { send: () => Promise.reject(new Error('smtp down')) } }

    await expect(request(failing, { email: EMAIL, mode: 'login' })).resolves.toStrictEqual({
      type: 'SERVER_ERROR',
    })
    expect(events.at(-1)).toMatchObject({
      'error.type': 'Error',
      event: 'auth.request_otp.failed',
      level: 50,
      op: 'mailer.send',
    })
  })

  it('answers a signup that loses its guest row to a registration as an existing account', async () => {
    expect.hasAssertions()

    const { db, deps, events, sentEmails } = setup()
    db.on(upsertGuestUser, () => null)

    await expect(request(deps, { email: EMAIL, mode: 'signup' })).resolves.toStrictEqual({
      error: { code: 'ALREADY_EXISTS' },
      type: 'BUSINESS_ERROR',
    })
    expect(sentEmails).toStrictEqual([])
    expect(logged(events)).toStrictEqual([
      'auth.request_otp.attempt',
      'auth.request_otp.blocked:exists',
    ])
  })
})

async function issued(status: Status, mode: 'login' | 'signup') {
  const env = setup(status)
  await request(env.deps, { email: EMAIL, mode })
  const start = env.db.calls.length
  env.events.length = 0
  io.setCookies = []
  return { ...env, calls: () => env.db.calls.slice(start), otp: env.lastOtp() }
}

const SESSION_COOKIE =
  /^__session=(?<sessionId>[\w-]{21})\.(?<rawToken>[\w-]{21}); Path=\/; Expires=(?<expires>[^;]+); HttpOnly; Secure; SameSite=Lax$/u

function sessionCookie(header: string | undefined) {
  const groups = SESSION_COOKIE.exec(header ?? '')?.groups
  if (groups?.expires === undefined || groups.rawToken === undefined) {
    throw new Error(`not a session cookie: ${header}`)
  }
  return { expires: new Date(groups.expires), rawToken: groups.rawToken }
}

describe('verifying a code', () => {
  it('sets a 30-day session cookie and logs success', async () => {
    expect.hasAssertions()

    expectTypeOf<VerifyOtpInput>().toEqualTypeOf<{
      email: string
      mode: 'login' | 'signup'
      otp: string
    }>()
    expectTypeOf<Awaited<ReturnType<typeof verifyOtp>>>().toEqualTypeOf<
      | BusinessErrorResponse<'INVALID_OR_EXPIRED_OTP' | 'RATE_LIMIT_EXCEEDED'>
      | ServerErrorResponse
      | ValidationErrorResponse
      | { type: 'SUCCESS' }
    >()

    const { deps, events, otp } = await issued('active', 'login')

    await expect(verify(deps, { email: EMAIL, mode: 'login', otp })).resolves.toStrictEqual({
      type: 'SUCCESS',
    })
    expect(io.setCookies).toHaveLength(1)
    const { expires } = sessionCookie(io.setCookies[0])
    expect(Math.abs(expires.getTime() - Date.now() - 30 * 86_400_000)).toBeLessThan(2000)
    expect(logged(events)).toStrictEqual(['auth.verify_otp.attempt', 'auth.verify_otp.success'])
  })

  it('claims the code, creates the session and resets the attempt count', async () => {
    expect.hasAssertions()

    const { attempts, calls, deps, otp } = await issued('active', 'login')
    await verify(deps, { email: EMAIL, mode: 'login', otp })

    expect(attempts.has(`otp_verify:${EMAIL}|ip:${ADDRESS}`)).toBe(false)
    expect(calls().map((c) => c.name)).toStrictEqual([
      'auth.recordAttempt',
      'auth.recordAttempt',
      'auth.recordAttempt',
      'account.findUserByEmail',
      'auth.findToken',
      'auth.claimTokenIfUnused',
      'auth.createSession',
      'auth.resetAttempts',
    ])
  })

  it('stores only the hash of the session token it puts in the cookie', async () => {
    expect.hasAssertions()

    const { db, deps, otp } = await issued('active', 'login')
    await verify(deps, { email: EMAIL, mode: 'login', otp })

    const { rawToken } = sessionCookie(io.setCookies[0])
    const insert = db.calls.find((c) => c.name === 'auth.createSession')
    expect(insert?.args[0]).toMatchObject({ tokenHash: deps.hashToken(rawToken), userId: 1 })
  })

  it('activates the guest in the same batch as the session on signup', async () => {
    expect.hasAssertions()

    const { calls, deps, otp, statusOf } = await issued('guest', 'signup')

    await expect(verify(deps, { email: EMAIL, mode: 'signup', otp })).resolves.toStrictEqual({
      type: 'SUCCESS',
    })
    expect(statusOf(EMAIL)).toBe('active')
    expect(
      calls()
        .map((c) => c.name)
        .slice(-3),
    ).toStrictEqual(['auth.createSession', 'account.activateUser', 'auth.resetAttempts'])
  })

  it('rejects a wrong code without a cookie', async () => {
    expect.hasAssertions()

    const { deps, events } = await issued('active', 'login')

    // Codes never start with 0, so this one is always wrong.
    await expect(
      verify(deps, { email: EMAIL, mode: 'login', otp: '012345' }),
    ).resolves.toStrictEqual({ error: { code: 'INVALID_OR_EXPIRED_OTP' }, type: 'BUSINESS_ERROR' })
    expect(io.setCookies).toStrictEqual([])
    expect(events.at(-1)).toMatchObject({ event: 'auth.verify_otp.invalid', reason: 'wrong_code' })
  })

  it.each(['suspended', 'deleted'] as const)(
    'rejects a login code issued before the user was %s, without claiming it or a cookie',
    async (status) => {
      expect.hasAssertions()

      const { calls, deps, events, otp, setStatus, tokens } = await issued('active', 'login')
      setStatus(EMAIL, status)

      await expect(verify(deps, { email: EMAIL, mode: 'login', otp })).resolves.toStrictEqual(
        invalidCode,
      )
      expect(io.setCookies).toStrictEqual([])
      expect(tokens[0]?.usedAt).toBeNull()
      expect(calls().map((c) => c.name)).toStrictEqual([
        'auth.recordAttempt',
        'auth.recordAttempt',
        'auth.recordAttempt',
        'account.findUserByEmail',
      ])
      expect(events.at(-1)).toMatchObject({
        event: 'auth.verify_otp.invalid',
        reason: 'expired_or_missing',
      })
    },
  )

  it('rejects a signup code entered in the login form', async () => {
    expect.hasAssertions()

    const { deps, events, otp } = await issued('guest', 'signup')

    await expect(verify(deps, { email: EMAIL, mode: 'login', otp })).resolves.toStrictEqual({
      error: { code: 'INVALID_OR_EXPIRED_OTP' },
      type: 'BUSINESS_ERROR',
    })
    expect(io.setCookies).toStrictEqual([])
    expect(events.at(-1)).toMatchObject({ reason: 'expired_or_missing' })
  })

  it('rejects an expired or missing code', async () => {
    expect.hasAssertions()

    const { db, deps, events, otp } = await issued('active', 'login')
    db.on(findToken, () => null)

    await expect(verify(deps, { email: EMAIL, mode: 'login', otp })).resolves.toStrictEqual({
      error: { code: 'INVALID_OR_EXPIRED_OTP' },
      type: 'BUSINESS_ERROR',
    })
    expect(io.setCookies).toStrictEqual([])
    expect(events.at(-1)).toMatchObject({ reason: 'expired_or_missing' })
  })

  it('accepts a code once', async () => {
    expect.hasAssertions()

    const { deps, events, otp } = await issued('active', 'login')
    await verify(deps, { email: EMAIL, mode: 'login', otp })

    await expect(verify(deps, { email: EMAIL, mode: 'login', otp })).resolves.toStrictEqual({
      error: { code: 'INVALID_OR_EXPIRED_OTP' },
      type: 'BUSINESS_ERROR',
    })
    expect(io.setCookies).toHaveLength(1)
    expect(events.at(-1)).toMatchObject({ reason: 'expired_or_missing' })
  })

  it('loses the race when another request claims the code first', async () => {
    expect.hasAssertions()

    const { calls, db, deps, events, otp } = await issued('active', 'login')
    db.on(claimTokenIfUnused, () => false)

    await expect(verify(deps, { email: EMAIL, mode: 'login', otp })).resolves.toStrictEqual({
      error: { code: 'INVALID_OR_EXPIRED_OTP' },
      type: 'BUSINESS_ERROR',
    })
    expect(calls().map((c) => c.name)).not.toContain('auth.createSession')
    expect(events.at(-1)).toMatchObject({ reason: 'expired_or_missing' })
  })

  it('refuses the eleventh attempt in a window', async () => {
    expect.hasAssertions()

    const { deps, events } = await issued('active', 'login')
    for (let i = 0; i < 10; i++) {
      // oxlint-disable-next-line no-await-in-loop -- attempts arrive one after another
      await verify(deps, { email: EMAIL, mode: 'login', otp: '000000' })
    }

    await expect(
      verify(deps, { email: EMAIL, mode: 'login', otp: '000000' }),
    ).resolves.toStrictEqual({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many attempts. Please try again in 5 minutes.',
      },
      type: 'BUSINESS_ERROR',
    })
    expect(events.at(-1)).toMatchObject({ event: 'auth.verify_otp.rate_limited', level: 40 })
  })

  it('refuses an attempt from an address over its limit without claiming the code', async () => {
    expect.hasAssertions()

    const { attempts, deps, events, otp, tokens } = await issued('active', 'login')
    fromAddress('2001:db8:1:2::9')
    attempts.set('otp_verify:ip:2001:db8:1:2::/64', 30)

    await expect(verify(deps, { email: EMAIL, mode: 'login', otp })).resolves.toStrictEqual({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many attempts. Please try again in 5 minutes.',
      },
      type: 'BUSINESS_ERROR',
    })
    expect(io.setCookies).toStrictEqual([])
    expect(tokens[0]?.usedAt).toBeNull()
    expect(events.at(-1)).toMatchObject({
      event: 'auth.verify_otp.rate_limited',
      ip: '2001:db8:1:2::/64',
    })
  })

  it('resets only the count of the email from the verifying address', async () => {
    expect.hasAssertions()

    const { attempts, deps, otp } = await issued('active', 'login')
    fromAddress('203.0.113.9')

    await expect(verify(deps, { email: EMAIL, mode: 'login', otp })).resolves.toStrictEqual(success)
    expect(attempts.get('otp_verify:ip:203.0.113.9')).toBe(1)
    expect(attempts.get(`otp_verify:${EMAIL}`)).toBe(1)
    expect(attempts.has(`otp_verify:${EMAIL}|ip:203.0.113.9`)).toBe(false)
  })

  it('rejects a code that is not six digits without touching the database', async () => {
    expect.hasAssertions()

    const { db, deps, events } = setup('active')

    await expect(
      verify(deps, { email: EMAIL, mode: 'login', otp: '12a456' }),
    ).resolves.toStrictEqual({
      errors: [{ message: 'must match pattern "^[0-9]{6}$"', path: '/otp' }],
      type: 'VALIDATION_ERROR',
    })
    expect(db.calls).toStrictEqual([])
    expect(logged(events)).toStrictEqual(['auth.verify_otp.validation_failed'])
  })

  it('redirects a signed-in caller home', async () => {
    expect.hasAssertions()

    const { db, deps, events } = setup('active')

    await expect(
      verifyOtpAction({
        context: testContext(MEMBER, deps),
        data: { email: EMAIL, mode: 'login', otp: '123456' },
      }),
    ).rejects.toMatchObject({ options: { to: '/' } })
    expect(db.calls).toStrictEqual([])
    expect(logged(events)).toStrictEqual(['auth.verify_otp.redirected'])
  })

  it('is a server error without a cookie when the session insert returns no row', async () => {
    expect.hasAssertions()

    const { db, deps, events, otp } = await issued('active', 'login')
    db.on(createSession, () => null)

    await expect(verify(deps, { email: EMAIL, mode: 'login', otp })).resolves.toStrictEqual({
      type: 'SERVER_ERROR',
    })
    expect(io.setCookies).toStrictEqual([])
    expect(events.at(-1)).toMatchObject({
      'error.type': 'no-row',
      event: 'auth.verify_otp.failed',
      level: 50,
      op: 'auth.createSession',
    })
  })

  it('is a server error without a cookie when the attempt cannot be counted', async () => {
    expect.hasAssertions()

    const { db, deps, events, otp } = await issued('active', 'login')
    db.on(recordAttempt, fail)

    await expect(verify(deps, { email: EMAIL, mode: 'login', otp })).resolves.toStrictEqual({
      type: 'SERVER_ERROR',
    })
    expect(io.setCookies).toStrictEqual([])
    expect(events.at(-1)).toMatchObject({
      'error.type': 'Error',
      event: 'auth.verify_otp.failed',
      level: 50,
      op: 'auth.recordAttempt',
    })
  })

  it.each([null, 42, 'x'])('rejects a body of %o without touching the database', async (body) => {
    expect.hasAssertions()

    const { db, deps } = setup('active')

    await expect(verify(deps, body)).resolves.toMatchObject({ type: 'VALIDATION_ERROR' })
    await expect(request(deps, body)).resolves.toMatchObject({ type: 'VALIDATION_ERROR' })
    expect(db.calls).toStrictEqual([])
  })

  it('still succeeds when the attempt count cannot be reset', async () => {
    expect.hasAssertions()

    const { db, deps, events, otp } = await issued('active', 'login')
    db.on(resetAttempts, fail)

    await expect(verify(deps, { email: EMAIL, mode: 'login', otp })).resolves.toStrictEqual({
      type: 'SUCCESS',
    })
    expect(io.setCookies).toHaveLength(1)
    expect(logged(events)).toStrictEqual([
      'auth.verify_otp.attempt',
      'auth.verify_otp.rate_limit_reset_failed',
      'auth.verify_otp.success',
    ])
    expect(events[1]).toMatchObject({ email: EMAIL, level: 50, op: 'auth.resetAttempts' })
  })
})

const tooMany = (message: string) => ({
  error: { code: 'RATE_LIMIT_EXCEEDED', message },
  type: 'BUSINESS_ERROR',
})

describe('one address against another', () => {
  const ATTACKER = '203.0.113.66'
  const VICTIM = '198.51.100.20'

  it('cannot keep the email from receiving a code on another address', async () => {
    expect.hasAssertions()

    const { deps, sentEmails } = setup('active')
    fromAddress(ATTACKER)
    const answers = []
    for (let i = 0; i < 20; i++) {
      // oxlint-disable-next-line no-await-in-loop -- requests arrive one after another
      answers.push(await request(deps, { email: EMAIL, mode: 'login' }))
    }
    fromAddress(VICTIM)

    await expect(request(deps, { email: EMAIL, mode: 'login' })).resolves.toStrictEqual(success)
    expect(answers.filter((a) => a.type === 'SUCCESS')).toHaveLength(5)
    expect(answers.at(-1)).toStrictEqual(
      tooMany('Too many requests. Please try again in 15 minutes.'),
    )
    expect(sentEmails).toHaveLength(6)
  })

  it('cannot keep the email from verifying its code on another address', async () => {
    expect.hasAssertions()

    const { deps, otp } = await issued('active', 'login')
    fromAddress(ATTACKER)
    let last: unknown
    for (let i = 0; i < 40; i++) {
      // oxlint-disable-next-line no-await-in-loop -- attempts arrive one after another
      last = await verify(deps, { email: EMAIL, mode: 'login', otp: '000000' })
    }
    fromAddress(VICTIM)

    expect(last).toStrictEqual(tooMany('Too many attempts. Please try again in 5 minutes.'))
    await expect(verify(deps, { email: EMAIL, mode: 'login', otp })).resolves.toStrictEqual(success)
    expect(io.setCookies).toHaveLength(1)
  })

  it('caps the codes sent to one email across many addresses at fifteen', async () => {
    expect.hasAssertions()

    const { deps, events, sentEmails } = setup('active')
    for (const address of ['203.0.113.1', '203.0.113.2', '203.0.113.3']) {
      fromAddress(address)
      for (let i = 0; i < 5; i++) {
        // oxlint-disable-next-line no-await-in-loop -- requests arrive one after another
        await request(deps, { email: EMAIL, mode: 'login' })
      }
    }
    fromAddress('203.0.113.4')

    await expect(request(deps, { email: EMAIL, mode: 'login' })).resolves.toStrictEqual(
      tooMany('Too many requests. Please try again in 15 minutes.'),
    )
    expect(sentEmails).toHaveLength(15)
    expect(events.at(-1)).toMatchObject({ event: 'auth.request_otp.rate_limited' })
    expect(events.at(-1)).not.toHaveProperty('ip')
  })
})

describe('a request without a usable client address', () => {
  it('logs that the per-address limit was skipped, and still counts the email', async () => {
    expect.hasAssertions()

    const { attempts, deps, events } = setup('active')
    io.request = new Request('https://app.give.test/')

    await expect(request(deps, { email: EMAIL, mode: 'login' })).resolves.toStrictEqual(success)
    expect(events[0]).toMatchObject({
      event: 'auth.rate_limit.no_client_address',
      level: 40,
      msg: 'No usable client address; the per-address limit is skipped',
    })
    expect(events[0]).not.toHaveProperty('x_real_ip')
    expect([...attempts.keys()]).toStrictEqual([
      `otp_request:${EMAIL}|ip:unknown`,
      `otp_request:${EMAIL}`,
    ])
  })

  it('logs at most 64 characters of an unparseable header', async () => {
    expect.hasAssertions()

    const { deps, events, otp } = await issued('active', 'login')
    io.request = new Request('https://app.give.test/', {
      headers: { 'x-real-ip': `203.0.113.7, ${'x'.repeat(200)}` },
    })

    await expect(verify(deps, { email: EMAIL, mode: 'login', otp })).resolves.toStrictEqual(success)
    const logged = events.find((e) => e.event === 'auth.rate_limit.no_client_address')
    expect(logged).toMatchObject({ level: 40, x_real_ip: `203.0.113.7, ${'x'.repeat(51)}` })
  })
})
