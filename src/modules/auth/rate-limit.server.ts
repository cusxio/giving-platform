import { Result } from 'better-result'

import { now } from '#/core/date'
import type { Deps } from '#/server/deps.server'
import type { InfraError } from '#/server/infra-error'

import { RateLimitExceededError } from './auth.errors'
import { recordAttempt, resetAttempts } from './rate-limits.repository.server'

type Action = 'otp_request' | 'otp_verify'

interface Limit {
  readonly maxAttempts: number
  readonly windowSeconds: number
}

const PER_EMAIL: Record<Action, Limit> = {
  otp_request: { maxAttempts: 5, windowSeconds: 15 * 60 },
  otp_verify: { maxAttempts: 10, windowSeconds: 5 * 60 },
}

type Checked = Promise<Result<void, InfraError | RateLimitExceededError>>

/** Counts one attempt under `identifier` and refuses it past the limit. */
async function count(
  deps: Pick<Deps, 'db'>,
  identifier: string,
  action: Action,
  { maxAttempts, windowSeconds }: Limit,
): Checked {
  const currentTime = now()
  const recorded = await deps.db.run(recordAttempt(identifier, action, windowSeconds, currentTime))
  return recorded.andThen((row) => {
    if ((row?.attemptCount ?? 1) <= maxAttempts) {
      return Result.ok()
    }
    const windowStartedAt = row?.windowStartedAt ?? currentTime
    const windowEndTime = windowStartedAt.getTime() + windowSeconds * 1000
    const retryAfterSeconds = Math.ceil((windowEndTime - now().getTime()) / 1000)
    return Result.err(
      new RateLimitExceededError({ retryAfterSeconds: Math.max(0, retryAfterSeconds) }),
    )
  })
}

/** Counts an OTP request for this email and refuses it past the limit. */
export function checkOtpRequest(deps: Pick<Deps, 'db'>, email: string): Checked {
  return count(deps, email.toLowerCase(), 'otp_request', PER_EMAIL.otp_request)
}

/** Counts an OTP verification attempt for this email and refuses it past the limit. */
export function checkOtpVerify(deps: Pick<Deps, 'db'>, email: string): Checked {
  return count(deps, email.toLowerCase(), 'otp_verify', PER_EMAIL.otp_verify)
}

/** Clears the verification count after a successful verification. */
export function resetOtpVerify(
  deps: Pick<Deps, 'db'>,
  email: string,
): Promise<Result<void, InfraError>> {
  return deps.db.run(resetAttempts(email.toLowerCase(), 'otp_verify'))
}
