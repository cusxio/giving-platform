import { describe, expect, it } from 'vitest'

import { createFakeDb } from '#/server/testing/fake-db'
import { errValue } from '#/server/testing/result'

import { checkOtpRequest, checkOtpVerify, resetOtpVerify } from './rate-limit.server'
import { recordAttempt, resetAttempts } from './rate-limits.repository.server'

function attemptsDb(
  attemptCount: number | ((identifier: string) => number),
  windowStartedAt: Date,
) {
  return createFakeDb().on(recordAttempt, (identifier, action, _windowSeconds, currentTime) => ({
    action,
    attemptCount: typeof attemptCount === 'number' ? attemptCount : attemptCount(identifier),
    id: 1,
    identifier,
    lastAttemptAt: currentTime,
    windowStartedAt,
  }))
}

/** The count the store answers for an address key and for an email key. */
const counts = (address: number, email: number) => (identifier: string) =>
  identifier.startsWith('ip:') ? address : email

describe('the OTP rate limits', () => {
  it('allows the fifth request and counts it under the lowercased email', async () => {
    expect.hasAssertions()

    const db = attemptsDb(5, new Date())

    const checked = await checkOtpRequest({ db }, 'Donor@Example.com', null)

    expect(checked.isOk()).toBe(true)
    expect(db.calls).toStrictEqual([
      {
        args: ['donor@example.com', 'otp_request', 900, expect.any(Date)],
        name: 'auth.recordAttempt',
      },
    ])
  })

  it('refuses the sixth request until its window ends', async () => {
    expect.hasAssertions()

    const db = attemptsDb(6, new Date(Date.now() - 60_000))

    expect(errValue(await checkOtpRequest({ db }, 'donor@example.com', null))).toMatchObject({
      _tag: 'RateLimitExceededError',
      retryAfterSeconds: 840,
    })
  })

  it('allows ten verification attempts in five minutes', async () => {
    expect.hasAssertions()

    const tenth = await checkOtpVerify({ db: attemptsDb(10, new Date()) }, 'd@x.test', null)
    const eleventh = await checkOtpVerify({ db: attemptsDb(11, new Date()) }, 'd@x.test', null)

    expect(tenth.isOk()).toBe(true)
    expect(errValue(eleventh)).toMatchObject({
      _tag: 'RateLimitExceededError',
      retryAfterSeconds: 300,
    })
  })

  it('counts the address, then the email, each in its own window', async () => {
    expect.hasAssertions()

    const db = attemptsDb(1, new Date())

    const checked = await checkOtpRequest({ db }, 'D@x.test', '203.0.113.7')

    expect(checked.isOk()).toBe(true)
    expect(db.calls).toStrictEqual([
      {
        args: ['ip:203.0.113.7', 'otp_request', 300, expect.any(Date)],
        name: 'auth.recordAttempt',
      },
      { args: ['d@x.test', 'otp_request', 900, expect.any(Date)], name: 'auth.recordAttempt' },
    ])
  })

  it.each([
    ['request', checkOtpRequest],
    ['verification', checkOtpVerify],
  ] as const)(
    'allows thirty %s attempts from one address in five minutes, then refuses without counting the email',
    async (_case, check) => {
      expect.hasAssertions()

      const thirtieth = await check(
        { db: attemptsDb(counts(30, 1), new Date()) },
        'd@x.test',
        '203.0.113.7',
      )
      const db = attemptsDb(counts(31, 1), new Date())
      const thirtyFirst = await check({ db }, 'd@x.test', '203.0.113.7')

      expect(thirtieth.isOk()).toBe(true)
      expect(errValue(thirtyFirst)).toMatchObject({
        _tag: 'RateLimitExceededError',
        ip: '203.0.113.7',
        retryAfterSeconds: 300,
      })
      expect(db.calls.map((c) => c.args[0])).toStrictEqual(['ip:203.0.113.7'])
    },
  )

  it('refuses past the email limit from an address under its own', async () => {
    expect.hasAssertions()

    const db = attemptsDb(counts(1, 6), new Date())

    expect(errValue(await checkOtpRequest({ db }, 'd@x.test', '203.0.113.7'))).toMatchObject({
      _tag: 'RateLimitExceededError',
      ip: null,
      retryAfterSeconds: 900,
    })
  })

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

  it('resets the verification count under the lowercased email', async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(resetAttempts, () => {})

    const reset = await resetOtpVerify({ db }, 'D@X.test')

    expect(reset.isOk()).toBe(true)
    expect(db.calls).toStrictEqual([
      { args: ['d@x.test', 'otp_verify'], name: 'auth.resetAttempts' },
    ])
  })
})
