import { describe, expect, it } from 'vitest'

import { createFakeDb } from '#/server/testing/fake-db'
import { errValue } from '#/server/testing/result'

import { checkOtpRequest, checkOtpVerify, resetOtpVerify } from './rate-limit.server'
import { recordAttempt, resetAttempts } from './rate-limits.repository.server'

interface Counts {
  readonly address?: number
  readonly client?: number
  readonly email?: number
}

/** A store that answers `counts` for the address key, the email-from-address key and the email. */
function attemptsDb({ address = 1, client = 1, email = 1 }: Counts, windowStartedAt: Date) {
  return createFakeDb().on(recordAttempt, (identifier, action, _windowSeconds, currentTime) => {
    let attemptCount = email
    if (identifier.startsWith('ip:')) {
      attemptCount = address
    } else if (identifier.includes('|ip:')) {
      attemptCount = client
    }
    return { action, attemptCount, id: 1, identifier, lastAttemptAt: currentTime, windowStartedAt }
  })
}

const keys = (db: ReturnType<typeof createFakeDb>) => db.calls.map((c) => c.args[0])

const verifyAt = (client: number) =>
  checkOtpVerify({ db: attemptsDb({ client }, new Date()) }, 'd@x.test', '203.0.113.7')

describe('the OTP rate limits', () => {
  it('counts the address, the email from that address, and the email, each in its own window', async () => {
    expect.hasAssertions()

    const db = attemptsDb({}, new Date())

    const checked = await checkOtpRequest({ db }, 'D@x.test', '203.0.113.7')

    expect(checked.isOk()).toBe(true)
    expect(db.calls).toStrictEqual([
      {
        args: ['ip:203.0.113.7', 'otp_request', 300, expect.any(Date)],
        name: 'auth.recordAttempt',
      },
      {
        args: ['d@x.test|ip:203.0.113.7', 'otp_request', 900, expect.any(Date)],
        name: 'auth.recordAttempt',
      },
      { args: ['d@x.test', 'otp_request', 900, expect.any(Date)], name: 'auth.recordAttempt' },
    ])
  })

  it('counts a request with no address under one shared key for the email', async () => {
    expect.hasAssertions()

    const db = attemptsDb({}, new Date())

    await checkOtpVerify({ db }, 'Donor@Example.com', null)

    expect(db.calls).toStrictEqual([
      {
        args: ['donor@example.com|ip:unknown', 'otp_verify', 300, expect.any(Date)],
        name: 'auth.recordAttempt',
      },
      {
        args: ['donor@example.com', 'otp_verify', 300, expect.any(Date)],
        name: 'auth.recordAttempt',
      },
    ])
  })

  it('allows five requests for an email from one address, then refuses until the window ends', async () => {
    expect.hasAssertions()

    const fifth = await checkOtpRequest(
      { db: attemptsDb({ client: 5 }, new Date()) },
      'd@x.test',
      '203.0.113.7',
    )
    const db = attemptsDb({ client: 6 }, new Date(Date.now() - 60_000))
    const sixth = await checkOtpRequest({ db }, 'd@x.test', '203.0.113.7')

    expect(fifth.isOk()).toBe(true)
    expect(errValue(sixth)).toMatchObject({
      _tag: 'RateLimitExceededError',
      ip: '203.0.113.7',
      retryAfterSeconds: 840,
    })
    expect(keys(db)).toStrictEqual(['ip:203.0.113.7', 'd@x.test|ip:203.0.113.7'])
  })

  it('allows ten verification attempts for an email from one address in five minutes', async () => {
    expect.hasAssertions()

    const tenth = await verifyAt(10)

    expect(tenth.isOk()).toBe(true)
    expect(errValue(await verifyAt(11))).toMatchObject({
      _tag: 'RateLimitExceededError',
      ip: '203.0.113.7',
      retryAfterSeconds: 300,
    })
  })

  it.each([
    ['request', checkOtpRequest, 15, 900],
    ['verification', checkOtpVerify, 30, 300],
  ] as const)(
    'refuses a %s past the email limit across addresses, from a client under its own',
    async (_case, check, maxAttempts, windowSeconds) => {
      expect.hasAssertions()

      const last = await check(
        { db: attemptsDb({ email: maxAttempts }, new Date()) },
        'd@x.test',
        '203.0.113.7',
      )
      const over = await check(
        { db: attemptsDb({ email: maxAttempts + 1 }, new Date()) },
        'd@x.test',
        '203.0.113.7',
      )

      expect(last.isOk()).toBe(true)
      expect(errValue(over)).toMatchObject({
        _tag: 'RateLimitExceededError',
        ip: null,
        retryAfterSeconds: windowSeconds,
      })
    },
  )

  it.each([
    ['request', checkOtpRequest],
    ['verification', checkOtpVerify],
  ] as const)(
    'allows thirty %s attempts from one address in five minutes, then refuses without counting the email',
    async (_case, check) => {
      expect.hasAssertions()

      const thirtieth = await check(
        { db: attemptsDb({ address: 30 }, new Date()) },
        'd@x.test',
        '203.0.113.7',
      )
      const db = attemptsDb({ address: 31 }, new Date())
      const thirtyFirst = await check({ db }, 'd@x.test', '203.0.113.7')

      expect(thirtieth.isOk()).toBe(true)
      expect(errValue(thirtyFirst)).toMatchObject({
        _tag: 'RateLimitExceededError',
        ip: '203.0.113.7',
        retryAfterSeconds: 300,
      })
      expect(keys(db)).toStrictEqual(['ip:203.0.113.7'])
    },
  )

  it('treats a missing row as the first attempt', async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(recordAttempt, () => null)

    const checked = await checkOtpVerify({ db }, 'd@x.test', null)

    expect(checked.isOk()).toBe(true)
  })

  it('reports a failed count as an infrastructure error', async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(recordAttempt, () => {
      throw new Error('connection terminated')
    })

    expect(errValue(await checkOtpRequest({ db }, 'd@x.test', null))).toMatchObject({
      _tag: 'InfraError',
      op: 'auth.recordAttempt',
      reason: 'failed',
    })
  })

  it('resets only the verifying client count, under the lowercased email', async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(resetAttempts, () => {})

    const reset = await resetOtpVerify({ db }, 'D@X.test', '203.0.113.7')

    expect(reset.isOk()).toBe(true)
    expect(db.calls).toStrictEqual([
      { args: ['d@x.test|ip:203.0.113.7', 'otp_verify'], name: 'auth.resetAttempts' },
    ])
  })
})
