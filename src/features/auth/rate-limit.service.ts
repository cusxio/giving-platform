import { now } from '#/core/date'
import type { DBQueryErrorResult } from '#/core/errors'
import type { Result } from '#/core/result'
import { err, ok } from '#/core/result'
import type { User } from '#/db/schema'

import type { RateLimitExceededError } from './auth.errors'
import type { RateLimitRepository } from './rate-limit.repository'

// Rate limit configuration
const OTP_REQUEST_MAX_ATTEMPTS = 5
const OTP_REQUEST_WINDOW_SECONDS = 15 * 60 // 15 minutes

const OTP_VERIFY_MAX_ATTEMPTS = 10
const OTP_VERIFY_WINDOW_SECONDS = 5 * 60 // 5 minutes

export type RateLimitResult = Result<
  { allowed: boolean; remaining: number },
  DBQueryErrorResult | RateLimitExceededError
>

export class RateLimitService {
  #repository: RateLimitRepository

  constructor(repository: RateLimitRepository) {
    this.#repository = repository
  }

  /**
   * Check rate limit for OTP request.
   * Increments attempt count and returns whether the request is allowed.
   */
  async checkOtpRequest(email: User['email']): Promise<RateLimitResult> {
    return this.#checkRateLimit(
      email.toLowerCase(),
      'otp_request',
      OTP_REQUEST_MAX_ATTEMPTS,
      OTP_REQUEST_WINDOW_SECONDS,
    )
  }

  /**
   * Check rate limit for OTP verification.
   * Increments attempt count and returns whether the verification attempt is allowed.
   */
  async checkOtpVerify(email: User['email']): Promise<RateLimitResult> {
    return this.#checkRateLimit(
      email.toLowerCase(),
      'otp_verify',
      OTP_VERIFY_MAX_ATTEMPTS,
      OTP_VERIFY_WINDOW_SECONDS,
    )
  }

  /**
   * Reset rate limit after successful OTP verification.
   */
  async resetOtpVerify(email: User['email']) {
    return this.#repository.reset(email.toLowerCase(), 'otp_verify')
  }

  async #checkRateLimit(
    identifier: string,
    action: 'otp_request' | 'otp_verify',
    maxAttempts: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const result = await this.#repository.checkAndIncrement(
      identifier,
      action,
      windowSeconds,
    )

    if (!result.ok) {
      return result
    }

    const { attemptCount, windowStartedAt } = result.value
    const remaining = Math.max(0, maxAttempts - attemptCount)
    const allowed = attemptCount <= maxAttempts

    if (!allowed) {
      const windowEndTime = windowStartedAt.getTime() + windowSeconds * 1000
      const retryAfterSeconds = Math.ceil(
        (windowEndTime - now().getTime()) / 1000,
      )

      return err({
        type: 'RateLimitExceededError',
        retryAfterSeconds: Math.max(0, retryAfterSeconds),
      })
    }

    return ok({ allowed, remaining })
  }
}
