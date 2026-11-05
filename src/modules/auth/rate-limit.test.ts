import { describe, expect, it } from 'vitest'

import { createFakeDb } from '#/server/testing/fake-db'

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

    await expect(checkOtpRequest({ db }, 'Donor@Example.com')).resolves.toStrictEqual({
      ok: true,
      value: { allowed: true, remaining: 0 },
    })
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

    await expect(checkOtpRequest({ db }, 'donor@example.com')).resolves.toStrictEqual({
      error: { retryAfterSeconds: 840, type: 'RateLimitExceededError' },
      ok: false,
    })
  })

  it('allows ten verification attempts in five minutes', async () => {
    expect.hasAssertions()

    await expect(
      checkOtpVerify({ db: attemptsDb(10, new Date()) }, 'd@x.test'),
    ).resolves.toMatchObject({ ok: true })
    await expect(
      checkOtpVerify({ db: attemptsDb(11, new Date()) }, 'd@x.test'),
    ).resolves.toMatchObject({
      error: { retryAfterSeconds: 300, type: 'RateLimitExceededError' },
      ok: false,
    })
  })

  it('treats a missing row as the first attempt', async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(recordAttempt, () => null)

    await expect(checkOtpVerify({ db }, 'd@x.test')).resolves.toStrictEqual({
      ok: true,
      value: { allowed: true, remaining: 9 },
    })
  })

  it('reports a failed count as a database error', async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(recordAttempt, () => {
      throw new Error('connection terminated')
    })

    await expect(checkOtpRequest({ db }, 'd@x.test')).resolves.toMatchObject({
      error: { type: 'DBQueryError' },
      ok: false,
    })
  })

  it('resets the verification count under the lowercased email', async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(resetAttempts, () => {})

    await expect(resetOtpVerify({ db }, 'D@X.test')).resolves.toStrictEqual({
      ok: true,
      value: undefined,
    })
    expect(db.calls).toStrictEqual([
      { args: ['d@x.test', 'otp_verify'], name: 'auth.resetAttempts' },
    ])
  })
})
