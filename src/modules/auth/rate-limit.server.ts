import { Result } from 'better-result'

import { now } from '#/core/date'
import { clientIp } from '#/server/client-ip.server'
import type { Deps } from '#/server/deps.server'
import type { InfraError } from '#/server/infra-error'

import { CodeExhaustedError, RateLimitExceededError } from './auth.errors'
import { recordAttempt, resetAttempts } from './rate-limits.repository.server'
import { CODE_LIFETIME_MINUTES } from './tokens.repository.server'

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

/** Long enough for any address, so a header holding something else is cut short in the log. */
const LOGGED_HEADER_LENGTH = 64

/**
 * The address the limits count against. A request without a usable one skips the per-address
 * limit, so it is logged: on Vercel the header is always set, and its absence means a change in
 * front of the app.
 */
export function limitedAddress(logger: Deps['logger'], headers: Headers): null | string {
  const ip = clientIp(headers)
  if (ip === null) {
    const header = headers.get('x-real-ip')
    logger.warn(
      {
        event: 'auth.rate_limit.no_client_address',
        ...(header !== null && { x_real_ip: header.slice(0, LOGGED_HEADER_LENGTH) }),
      },
      'No usable client address; the per-address limit is skipped',
    )
  }
  return ip
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

/**
 * Checks one code accepts from every address together, the right one included. Counting comes
 * before the comparison, so concurrent guesses cannot slip past the limit. The window opens at the
 * first check, after the code was issued, so it outlives the code and never resets during its
 * life. One code thus faces at most five guesses, however many addresses send them.
 */
const CODE_CHECKS: Limit = { maxAttempts: 5, windowSeconds: CODE_LIFETIME_MINUTES * 60 }

/** Counts a check of the code and refuses every check after its fifth. */
export async function checkCode(
  deps: Pick<Deps, 'db'>,
  tokenId: number,
): Promise<Result<void, CodeExhaustedError | InfraError>> {
  const { maxAttempts, windowSeconds } = CODE_CHECKS
  const recorded = await deps.db.run(
    recordAttempt(`code:${tokenId}`, 'otp_verify', windowSeconds, now()),
  )
  return recorded.andThen((row) =>
    (row?.attemptCount ?? 1) <= maxAttempts ? Result.ok() : Result.err(new CodeExhaustedError()),
  )
}
