import { pino } from 'pino'
import { describe, expect, it, vi } from 'vitest'

import { activateUser, findUserByEmail, upsertGuestUser } from '#/modules/account/server'
import type { QueryResult } from '#/server/db.server'
import type { MailMessage } from '#/server/mailer.server'
import type { FakeDb } from '#/server/testing/fake-db'
import { createFakeDb } from '#/server/testing/fake-db'
import { testDeps } from '#/server/testing/test-deps'

import { recordAttempt, resetAttempts } from './rate-limits.repository.server'
import { login, requestOtpProcedure, signup } from './request-otp.server'
import { createSession } from './sessions.repository.server'
import { claimTokenIfUnused, createToken, findToken } from './tokens.repository.server'
import { validateOtp, verifyOtpProcedure } from './verify-otp.server'

const io = vi.hoisted(() => ({ setCookies: [] as string[] }))

vi.mock(import('@tanstack/react-start/server'), () => ({
  setResponseHeader: (name, value) => {
    if (name === 'Set-Cookie') {
      io.setCookies.push(...[value].flat())
    }
  },
}))

const EMAIL = 'donor@example.com'

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

function setup(existing?: Status) {
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

describe('signing up', () => {
  it('emails a code to a new email address', async () => {
    expect.hasAssertions()

    const { deps, sentEmails, statusOf } = setup()
    const result = await signup(deps, EMAIL)

    expect(result).toStrictEqual({ ok: true, value: undefined })
    expect(sentEmails.map((e) => e.to)).toStrictEqual([EMAIL])
    expect(statusOf(EMAIL)).toBe('guest')
  })

  it('emails a code to a guest', async () => {
    expect.hasAssertions()

    const { deps, sentEmails } = setup('guest')
    const result = await signup(deps, EMAIL)

    expect(result).toStrictEqual({ ok: true, value: undefined })
    expect(sentEmails.map((e) => e.to)).toStrictEqual([EMAIL])
  })

  it('rejects an active user without emailing a code', async () => {
    expect.hasAssertions()

    const { deps, sentEmails } = setup('active')
    const result = await signup(deps, EMAIL)

    expect(result).toStrictEqual({ error: { type: 'AlreadyExistsError' }, ok: false })
    expect(sentEmails).toStrictEqual([])
  })

  it.each(['suspended', 'deleted'] as const)(
    'rejects a %s user without emailing a code',
    async (status) => {
      expect.hasAssertions()

      const { deps, sentEmails, statusOf } = setup(status)
      const result = await signup(deps, EMAIL)

      expect(result).toMatchObject({ error: { type: 'InactiveAccountError' }, ok: false })
      expect(sentEmails).toStrictEqual([])
      expect(statusOf(EMAIL)).toBe(status)
    },
  )
})

describe('logging in', () => {
  it('emails a code to an active user', async () => {
    expect.hasAssertions()

    const { deps, sentEmails } = setup('active')

    await expect(login(deps, EMAIL)).resolves.toStrictEqual({ ok: true, value: undefined })
    expect(sentEmails.map((e) => e.to)).toStrictEqual([EMAIL])
  })

  it.each(['guest', 'suspended', 'deleted', undefined] as const)(
    'treats a %s user as not existing without emailing a code',
    async (status) => {
      expect.hasAssertions()

      const { deps, sentEmails } = setup(status)

      await expect(login(deps, EMAIL)).resolves.toStrictEqual({
        error: { type: 'NotExistsError' },
        ok: false,
      })
      expect(sentEmails).toStrictEqual([])
    },
  )
})

describe('validating a signup code', () => {
  it('activates a guest and issues a session', async () => {
    expect.hasAssertions()

    const { deps, lastOtp, statusOf } = setup('guest')
    await signup(deps, EMAIL)
    const result = await validateOtp(deps, EMAIL, lastOtp(), 'signup')

    expect(result).toMatchObject({ ok: true })
    expect(statusOf(EMAIL)).toBe('active')
  })

  it.each(['suspended', 'deleted'] as const)(
    'rejects a code issued before the user was %s without activating them',
    async (status) => {
      expect.hasAssertions()

      const { deps, lastOtp, setStatus, statusOf } = setup('guest')
      await signup(deps, EMAIL)
      const otp = lastOtp()
      setStatus(EMAIL, status)
      const result = await validateOtp(deps, EMAIL, otp, 'signup')

      expect(result).toStrictEqual({ error: { type: 'InvalidRequestError' }, ok: false })
      expect(statusOf(EMAIL)).toBe(status)
    },
  )
})

const anonymous = <D>(deps: D) => ({ deps, user: null })
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

      await expect(
        requestOtpProcedure(anonymous(deps), { email: EMAIL, mode }),
      ).resolves.toStrictEqual(response)
      expect(tokens.map((t) => t.mode)).toStrictEqual(issuedModes)
      expect(sentEmails.map((e) => e.to)).toStrictEqual(issuedModes.map(() => EMAIL))
      expect(logged(events)).toStrictEqual(steps.map((s) => `auth.request_otp.${s}`))
    },
  )

  it('sends the login template with a code the stored hash matches', async () => {
    expect.hasAssertions()

    const { deps, lastOtp, sentEmails, tokens } = setup('active')
    await requestOtpProcedure(anonymous(deps), { email: EMAIL, mode: 'login' })

    expect(sentEmails[0]?.subject).toMatch(/^Login for /u)
    expect(tokens[0]?.tokenHash).toBe(deps.hashToken(lastOtp()))
  })

  it('normalizes the email before limiting and looking it up', async () => {
    expect.hasAssertions()

    const { db, deps } = setup('active')
    await requestOtpProcedure(anonymous(deps), { email: '  Donor@Example.COM ', mode: 'login' })

    expect(db.calls.slice(0, 2)).toStrictEqual([
      { args: [EMAIL, 'otp_request', 900, expect.any(Date)], name: 'auth.recordAttempt' },
      { args: [EMAIL], name: 'account.findUserByEmail' },
    ])
  })

  it('refuses the sixth request in a window', async () => {
    expect.hasAssertions()

    const { deps, events, sentEmails } = setup('active')
    for (let i = 0; i < 5; i++) {
      // oxlint-disable-next-line no-await-in-loop -- requests arrive one after another
      await requestOtpProcedure(anonymous(deps), { email: EMAIL, mode: 'login' })
    }
    const response = await requestOtpProcedure(anonymous(deps), { email: EMAIL, mode: 'login' })

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

  it('rejects an invalid email without touching the database', async () => {
    expect.hasAssertions()

    const { db, deps, events } = setup()

    await expect(
      requestOtpProcedure(anonymous(deps), { email: 'not-an-email', mode: 'login' }),
    ).resolves.toStrictEqual({
      errors: [{ message: 'must match format "email"', path: '/email' }],
      type: 'VALIDATION_ERROR',
    })
    expect(db.calls).toStrictEqual([])
    expect(logged(events)).toStrictEqual(['auth.request_otp.validation_failed'])
  })

  it('redirects a signed-in caller home', async () => {
    expect.hasAssertions()

    const { db, deps, events } = setup('active')
    const user = { id: 1, journey: null, role: 'user' as const }

    await expect(
      requestOtpProcedure({ deps, user }, { email: EMAIL, mode: 'login' }),
    ).rejects.toMatchObject({ options: { to: '/' } })
    expect(db.calls).toStrictEqual([])
    expect(logged(events)).toStrictEqual(['auth.request_otp.redirected'])
  })

  it.each([
    [
      'the rate limit check fails',
      'rate_limit_check_failed',
      (db: FakeDb) => db.on(recordAttempt, fail),
    ],
    ['the user lookup fails', 'failed', (db: FakeDb) => db.on(findUserByEmail, fail)],
    ['the token insert fails', 'failed', (db: FakeDb) => db.on(createToken, fail)],
  ] as const)('is a server error when %s', async (_case, event, breakDb) => {
    expect.hasAssertions()

    const { db, deps, events } = setup('active')
    breakDb(db)

    await expect(
      requestOtpProcedure(anonymous(deps), { email: EMAIL, mode: 'login' }),
    ).resolves.toStrictEqual({ type: 'SERVER_ERROR' })
    expect(events.at(-1)).toMatchObject({ event: `auth.request_otp.${event}`, level: 50 })
  })

  it('is a server error when the email cannot be sent', async () => {
    expect.hasAssertions()

    const { deps, events } = setup('active')
    const failing = { ...deps, mailer: { send: () => Promise.reject(new Error('smtp down')) } }

    await expect(
      requestOtpProcedure(anonymous(failing), { email: EMAIL, mode: 'login' }),
    ).resolves.toStrictEqual({ type: 'SERVER_ERROR' })
    expect(events.at(-1)).toMatchObject({
      error_type: 'SendEmailError',
      event: 'auth.request_otp.failed',
      level: 50,
    })
  })

  it('is a server error when the guest insert returns no row', async () => {
    expect.hasAssertions()

    const { db, deps, events } = setup()
    db.on(upsertGuestUser, () => null)

    await expect(
      requestOtpProcedure(anonymous(deps), { email: EMAIL, mode: 'signup' }),
    ).resolves.toStrictEqual({ type: 'SERVER_ERROR' })
    expect(events.at(-1)).toMatchObject({
      error_type: 'DBEmptyReturnError',
      event: 'auth.request_otp.failed',
    })
  })
})

async function issued(status: Status, mode: 'login' | 'signup') {
  const env = setup(status)
  await requestOtpProcedure(anonymous(env.deps), { email: EMAIL, mode })
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

    const { deps, events, otp } = await issued('active', 'login')

    await expect(
      verifyOtpProcedure(anonymous(deps), { email: EMAIL, mode: 'login', otp }),
    ).resolves.toStrictEqual({ type: 'SUCCESS' })
    expect(io.setCookies).toHaveLength(1)
    const { expires } = sessionCookie(io.setCookies[0])
    expect(Math.abs(expires.getTime() - Date.now() - 30 * 86_400_000)).toBeLessThan(2000)
    expect(logged(events)).toStrictEqual(['auth.verify_otp.attempt', 'auth.verify_otp.success'])
  })

  it('claims the code, creates the session and resets the attempt count', async () => {
    expect.hasAssertions()

    const { attempts, calls, deps, otp } = await issued('active', 'login')
    await verifyOtpProcedure(anonymous(deps), { email: EMAIL, mode: 'login', otp })

    expect(attempts.has(`otp_verify:${EMAIL}`)).toBe(false)
    expect(calls().map((c) => c.name)).toStrictEqual([
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
    await verifyOtpProcedure(anonymous(deps), { email: EMAIL, mode: 'login', otp })

    const { rawToken } = sessionCookie(io.setCookies[0])
    const insert = db.calls.find((c) => c.name === 'auth.createSession')
    expect(insert?.args[0]).toMatchObject({ tokenHash: deps.hashToken(rawToken), userId: 1 })
  })

  it('activates the guest in the same batch as the session on signup', async () => {
    expect.hasAssertions()

    const { calls, deps, otp, statusOf } = await issued('guest', 'signup')

    await expect(
      verifyOtpProcedure(anonymous(deps), { email: EMAIL, mode: 'signup', otp }),
    ).resolves.toStrictEqual({ type: 'SUCCESS' })
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
      verifyOtpProcedure(anonymous(deps), { email: EMAIL, mode: 'login', otp: '012345' }),
    ).resolves.toStrictEqual({ error: { code: 'INVALID_OR_EXPIRED_OTP' }, type: 'BUSINESS_ERROR' })
    expect(io.setCookies).toStrictEqual([])
    expect(events.at(-1)).toMatchObject({ event: 'auth.verify_otp.invalid', reason: 'wrong_code' })
  })

  it('rejects a signup code entered in the login form', async () => {
    expect.hasAssertions()

    const { deps, events, otp } = await issued('guest', 'signup')

    await expect(
      verifyOtpProcedure(anonymous(deps), { email: EMAIL, mode: 'login', otp }),
    ).resolves.toStrictEqual({ error: { code: 'INVALID_OR_EXPIRED_OTP' }, type: 'BUSINESS_ERROR' })
    expect(io.setCookies).toStrictEqual([])
    expect(events.at(-1)).toMatchObject({ reason: 'expired_or_missing' })
  })

  it('rejects an expired or missing code', async () => {
    expect.hasAssertions()

    const { db, deps, events, otp } = await issued('active', 'login')
    db.on(findToken, () => null)

    await expect(
      verifyOtpProcedure(anonymous(deps), { email: EMAIL, mode: 'login', otp }),
    ).resolves.toStrictEqual({ error: { code: 'INVALID_OR_EXPIRED_OTP' }, type: 'BUSINESS_ERROR' })
    expect(io.setCookies).toStrictEqual([])
    expect(events.at(-1)).toMatchObject({ reason: 'expired_or_missing' })
  })

  it('accepts a code once', async () => {
    expect.hasAssertions()

    const { deps, events, otp } = await issued('active', 'login')
    await verifyOtpProcedure(anonymous(deps), { email: EMAIL, mode: 'login', otp })

    await expect(
      verifyOtpProcedure(anonymous(deps), { email: EMAIL, mode: 'login', otp }),
    ).resolves.toStrictEqual({ error: { code: 'INVALID_OR_EXPIRED_OTP' }, type: 'BUSINESS_ERROR' })
    expect(io.setCookies).toHaveLength(1)
    expect(events.at(-1)).toMatchObject({ reason: 'expired_or_missing' })
  })

  it('loses the race when another request claims the code first', async () => {
    expect.hasAssertions()

    const { calls, db, deps, events, otp } = await issued('active', 'login')
    db.on(claimTokenIfUnused, () => false)

    await expect(
      verifyOtpProcedure(anonymous(deps), { email: EMAIL, mode: 'login', otp }),
    ).resolves.toStrictEqual({ error: { code: 'INVALID_OR_EXPIRED_OTP' }, type: 'BUSINESS_ERROR' })
    expect(calls().map((c) => c.name)).not.toContain('auth.createSession')
    expect(events.at(-1)).toMatchObject({ reason: 'expired_or_missing' })
  })

  it('refuses the eleventh attempt in a window', async () => {
    expect.hasAssertions()

    const { deps, events } = await issued('active', 'login')
    for (let i = 0; i < 10; i++) {
      // oxlint-disable-next-line no-await-in-loop -- attempts arrive one after another
      await verifyOtpProcedure(anonymous(deps), { email: EMAIL, mode: 'login', otp: '000000' })
    }

    await expect(
      verifyOtpProcedure(anonymous(deps), { email: EMAIL, mode: 'login', otp: '000000' }),
    ).resolves.toStrictEqual({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many attempts. Please try again in 5 minutes.',
      },
      type: 'BUSINESS_ERROR',
    })
    expect(events.at(-1)).toMatchObject({ event: 'auth.verify_otp.rate_limited', level: 40 })
  })

  it('rejects a code that is not six digits without touching the database', async () => {
    expect.hasAssertions()

    const { db, deps, events } = setup('active')

    await expect(
      verifyOtpProcedure(anonymous(deps), { email: EMAIL, mode: 'login', otp: '12a456' }),
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
    const user = { id: 1, journey: null, role: 'user' as const }

    await expect(
      verifyOtpProcedure({ deps, user }, { email: EMAIL, mode: 'login', otp: '123456' }),
    ).rejects.toMatchObject({ options: { to: '/' } })
    expect(db.calls).toStrictEqual([])
    expect(logged(events)).toStrictEqual(['auth.verify_otp.redirected'])
  })

  it('is a server error without a cookie when the session insert returns no row', async () => {
    expect.hasAssertions()

    const { db, deps, events, otp } = await issued('active', 'login')
    db.on(createSession, () => null)

    await expect(
      verifyOtpProcedure(anonymous(deps), { email: EMAIL, mode: 'login', otp }),
    ).resolves.toStrictEqual({ type: 'SERVER_ERROR' })
    expect(io.setCookies).toStrictEqual([])
    expect(events.at(-1)).toMatchObject({
      error_type: 'DBEmptyReturnError',
      event: 'auth.verify_otp.failed',
      level: 50,
    })
  })

  it('still succeeds when the attempt count cannot be reset', async () => {
    expect.hasAssertions()

    const { db, deps, events, otp } = await issued('active', 'login')
    db.on(resetAttempts, fail)

    await expect(
      verifyOtpProcedure(anonymous(deps), { email: EMAIL, mode: 'login', otp }),
    ).resolves.toStrictEqual({ type: 'SUCCESS' })
    expect(io.setCookies).toHaveLength(1)
    expect(logged(events)).toStrictEqual([
      'auth.verify_otp.attempt',
      'auth.verify_otp.rate_limit_reset_failed',
      'auth.verify_otp.success',
    ])
  })
})
