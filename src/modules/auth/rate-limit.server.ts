import { now } from '#/core/date'
import type { DBQueryErrorResult } from '#/core/errors'
import { createDBError } from '#/core/errors'
import type { Result } from '#/core/result'
import { err, ok, tryAsync } from '#/core/result'
import type { Deps } from '#/server/deps.server'
import { legacyDb } from '#/server/legacy-db.server'

import type { RateLimitExceededError } from './auth.errors'
import { recordAttempt, resetAttempts } from './rate-limits.repository.server'

const OTP_REQUEST_MAX_ATTEMPTS = 5
const OTP_REQUEST_WINDOW_SECONDS = 15 * 60

const OTP_VERIFY_MAX_ATTEMPTS = 10
const OTP_VERIFY_WINDOW_SECONDS = 5 * 60

type RateLimitResult = Result<
  { allowed: boolean; remaining: number },
  DBQueryErrorResult | RateLimitExceededError
>

/** Counts an OTP request for this email and refuses it past the limit. */
export async function checkOtpRequest(
  deps: Pick<Deps, 'db'>,
  email: string,
): Promise<RateLimitResult> {
  return checkRateLimit(
    deps,
    email.toLowerCase(),
    'otp_request',
    OTP_REQUEST_MAX_ATTEMPTS,
    OTP_REQUEST_WINDOW_SECONDS,
  )
}

/** Counts an OTP verification attempt for this email and refuses it past the limit. */
export async function checkOtpVerify(
  deps: Pick<Deps, 'db'>,
  email: string,
): Promise<RateLimitResult> {
  return checkRateLimit(
    deps,
    email.toLowerCase(),
    'otp_verify',
    OTP_VERIFY_MAX_ATTEMPTS,
    OTP_VERIFY_WINDOW_SECONDS,
  )
}

/** Clears the verification count after a successful verification. */
export async function resetOtpVerify(
  deps: Pick<Deps, 'db'>,
  email: string,
): Promise<Result<void, DBQueryErrorResult>> {
  const result = await tryAsync(
    () => legacyDb(deps.db).run(resetAttempts(email.toLowerCase(), 'otp_verify')),
    createDBError,
  )

  return result.ok ? ok() : result
}

async function checkRateLimit(
  deps: Pick<Deps, 'db'>,
  identifier: string,
  action: 'otp_request' | 'otp_verify',
  maxAttempts: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const currentTime = now()
  const result = await tryAsync(
    () => legacyDb(deps.db).run(recordAttempt(identifier, action, windowSeconds, currentTime)),
    createDBError,
  )

  if (!result.ok) {
    return result
  }

  const attemptCount = result.value?.attemptCount ?? 1
  const windowStartedAt = result.value?.windowStartedAt ?? currentTime
  const remaining = Math.max(0, maxAttempts - attemptCount)
  const allowed = attemptCount <= maxAttempts

  if (!allowed) {
    const windowEndTime = windowStartedAt.getTime() + windowSeconds * 1000
    const retryAfterSeconds = Math.ceil((windowEndTime - now().getTime()) / 1000)

    return err({
      retryAfterSeconds: Math.max(0, retryAfterSeconds),
      type: 'RateLimitExceededError',
    })
  }

  return ok({ allowed, remaining })
}
