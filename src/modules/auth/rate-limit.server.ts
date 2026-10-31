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

/**
 * So one address cannot work through many emails. Supabase Auth's per-IP defaults for its OTP and
 * verify endpoints, which leave room for a congregation sharing one network.
 */
const PER_ADDRESS: Record<Action, Limit> = {
  otp_request: { maxAttempts: 30, windowSeconds: 5 * 60 },
  otp_verify: { maxAttempts: 30, windowSeconds: 5 * 60 },
}

type Checked = Promise<Result<void, InfraError | RateLimitExceededError>>

/** Counts one attempt under `identifier` and refuses it past the limit. */
async function count(
  deps: Pick<Deps, 'db'>,
  identifier: string,
  action: Action,
  { maxAttempts, windowSeconds }: Limit,
  ip: null | string,
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
      new RateLimitExceededError({ ip, retryAfterSeconds: Math.max(0, retryAfterSeconds) }),
    )
  })
}

/**
 * Counts the attempt against the client address, when there is one, and then against the email.
 * An address over its limit is refused before the email's count moves.
 */
function check(deps: Pick<Deps, 'db'>, action: Action, email: string, ip: null | string): Checked {
  return Result.gen(async function* limits() {
    if (ip !== null) {
      yield* Result.await(count(deps, `ip:${ip}`, action, PER_ADDRESS[action], ip))
    }
    yield* Result.await(count(deps, email.toLowerCase(), action, PER_EMAIL[action], null))
    return Result.ok()
  })
}

/** Counts an OTP request and refuses it past the address's or the email's limit. */
export function checkOtpRequest(deps: Pick<Deps, 'db'>, email: string, ip: null | string): Checked {
  return check(deps, 'otp_request', email, ip)
}

/** Counts an OTP verification attempt and refuses it past the address's or the email's limit. */
export function checkOtpVerify(deps: Pick<Deps, 'db'>, email: string, ip: null | string): Checked {
  return check(deps, 'otp_verify', email, ip)
}

/** Clears the verification count after a successful verification. */
export function resetOtpVerify(
  deps: Pick<Deps, 'db'>,
  email: string,
): Promise<Result<void, InfraError>> {
  return deps.db.run(resetAttempts(email.toLowerCase(), 'otp_verify'))
}
