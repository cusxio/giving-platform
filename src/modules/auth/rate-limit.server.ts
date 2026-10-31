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

/**
 * Each attempt counts against three keys in turn, and the first one over its limit refuses it:
 *
 * - `address`: the client address across all emails, so one address cannot work through many
 *   emails. Supabase Auth's per-IP defaults, which leave room for a congregation on one network.
 * - `client`: the email from one address. The strict limit, so a client that floods an inbox or
 *   guesses codes stops itself without locking out the same email on another address.
 * - `email`: the email across all addresses, so many addresses together cannot flood one inbox
 *   or guess one code. It is three times the client limit: one address fills at most two client
 *   windows inside one email window, so it alone can never use up the email's allowance.
 */
const LIMITS: Record<Action, Readonly<Record<'address' | 'client' | 'email', Limit>>> = {
  otp_request: {
    address: { maxAttempts: 30, windowSeconds: 5 * 60 },
    client: { maxAttempts: 5, windowSeconds: 15 * 60 },
    email: { maxAttempts: 15, windowSeconds: 15 * 60 },
  },
  otp_verify: {
    address: { maxAttempts: 30, windowSeconds: 5 * 60 },
    client: { maxAttempts: 10, windowSeconds: 5 * 60 },
    email: { maxAttempts: 30, windowSeconds: 5 * 60 },
  },
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

/** The key of an email from one address. Requests with no address share one key per email. */
const clientKey = (email: string, ip: null | string) =>
  `${email.toLowerCase()}|ip:${ip ?? 'unknown'}`

/**
 * Counts the attempt against the address, the email from that address, and the email, in that
 * order. A refused count leaves the later ones unmoved, so a client over its own limit adds
 * nothing to the email's.
 */
function check(deps: Pick<Deps, 'db'>, action: Action, email: string, ip: null | string): Checked {
  const limits = LIMITS[action]
  return Result.gen(async function* limited() {
    if (ip !== null) {
      yield* Result.await(count(deps, `ip:${ip}`, action, limits.address, ip))
    }
    yield* Result.await(count(deps, clientKey(email, ip), action, limits.client, ip))
    yield* Result.await(count(deps, email.toLowerCase(), action, limits.email, null))
    return Result.ok()
  })
}

/** Counts an OTP request and refuses it past the address's, the client's or the email's limit. */
export function checkOtpRequest(deps: Pick<Deps, 'db'>, email: string, ip: null | string): Checked {
  return check(deps, 'otp_request', email, ip)
}

/** Counts an OTP verification and refuses it past the address's, the client's or the email's limit. */
export function checkOtpVerify(deps: Pick<Deps, 'db'>, email: string, ip: null | string): Checked {
  return check(deps, 'otp_verify', email, ip)
}

/**
 * Clears the client's verification count after it verified. The email's count stays, so a
 * success on one address does not clear what other addresses spent guessing.
 */
export function resetOtpVerify(
  deps: Pick<Deps, 'db'>,
  email: string,
  ip: null | string,
): Promise<Result<void, InfraError>> {
  return deps.db.run(resetAttempts(clientKey(email, ip), 'otp_verify'))
}
