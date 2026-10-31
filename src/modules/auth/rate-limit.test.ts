import { describe, expect, it } from 'vitest'

import { createFakeDb } from '#/server/testing/fake-db'
import { errValue } from '#/server/testing/result'

import { checkOtpRequest, checkOtpVerify, resetOtpVerify } from './rate-limit.server'
import { recordAttempt, resetAttempts } from './rate-limits.repository.server'

function attemptsDb(attemptCount: number, windowStartedAt: Date) {
  return createFakeDb().on(recordAttempt, (identifier, action, _windowSeconds, currentTime) => ({
    action,
    attemptCount,
    id: 1,
    identifier,
    lastAttemptAt: currentTime,
    windowStartedAt,
  }))
}

describe('the OTP rate limits', () => {
  it('allows the fifth request and counts it under the lowercased email', async () => {
    expect.hasAssertions()

    const db = attemptsDb(5, new Date())

    const checked = await checkOtpRequest({ db }, 'Donor@Example.com')

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

    expect(errValue(await checkOtpRequest({ db }, 'donor@example.com'))).toMatchObject({
      _tag: 'RateLimitExceededError',
      retryAfterSeconds: 840,
    })
  })

  it('allows ten verification attempts in five minutes', async () => {
    expect.hasAssertions()

    const tenth = await checkOtpVerify({ db: attemptsDb(10, new Date()) }, 'd@x.test')
    const eleventh = await checkOtpVerify({ db: attemptsDb(11, new Date()) }, 'd@x.test')

    expect(tenth.isOk()).toBe(true)
    expect(errValue(eleventh)).toMatchObject({
      _tag: 'RateLimitExceededError',
      retryAfterSeconds: 300,
    })
  })

  it('treats a missing row as the first attempt', async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(recordAttempt, () => null)

    const checked = await checkOtpVerify({ db }, 'd@x.test')

    expect(checked.isOk()).toBe(true)
  })

  it('reports a failed count as an infrastructure error', async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(recordAttempt, () => {
      throw new Error('connection terminated')
    })

    expect(errValue(await checkOtpRequest({ db }, 'd@x.test'))).toMatchObject({
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
