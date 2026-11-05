import { createHash } from 'node:crypto'

import { Result } from 'better-result'

import { now } from '#/core/date'
import { clientIp } from '#/server/client-ip.server'
import type { Deps } from '#/server/deps.server'
import type { InfraError } from '#/server/infra-error'

import { RateLimitExceededError } from './auth.errors'
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
 *   guesses codes stops itself without locking out the same email on another address. A guess
 *   spends a check of every live code, so five quick wrong guesses from one address void every
 *   code live at that moment, and that address then cannot verify the email for the rest of the
 *   window. That is the cost of bounding each code at five guesses.
 * - `email`: the email across all addresses, so many addresses together cannot flood one inbox
 *   or guess one code. Its window is never longer than the client's, so one address fills at most
 *   two client windows inside it; the cap is more than twice the client limit, so one address
 *   alone can never use up the email's allowance.
 */
const LIMITS: Record<Action, Readonly<Record<'address' | 'client' | 'email', Limit>>> = {
  otp_request: {
    address: { maxAttempts: 30, windowSeconds: 5 * 60 },
    client: { maxAttempts: 5, windowSeconds: 15 * 60 },
    email: { maxAttempts: 15, windowSeconds: 15 * 60 },
  },
  otp_verify: {
    address: { maxAttempts: 30, windowSeconds: 5 * 60 },
    client: { maxAttempts: 5, windowSeconds: 15 * 60 },
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

/**
 * The key of an email from one address. Requests with no address share one key per email. It is
 * hashed because an email and an address together can pass the identifier's 255 characters.
 */
export const clientKey = (email: string, ip: null | string) =>
  `client:${createHash('sha256')
    .update(`${email.toLowerCase()}|ip:${ip ?? 'unknown'}`)
    .digest('hex')}`

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
 * first check, after the code was issued, so it outlives the code's own lifetime. One issue of a
 * code thus faces at most five guesses, however many addresses send them, and a guess while
 * several codes are live counts against each of them. A reissue of the same digits while the code
 * is live (`createToken`) extends its life and keeps its count. It spends what is left of the old
 * window first and gets five fresh checks only once that window ends, so the digits still face at
 * most five guesses per issue.
 */
const CODE_CHECKS: Limit = { maxAttempts: 5, windowSeconds: CODE_LIFETIME_MINUTES * 60 }

/** A rate-limit row whose window started this long ago counts for nothing under any limit. */
export const LONGEST_WINDOW_SECONDS = Math.max(
  CODE_CHECKS.windowSeconds,
  ...Object.values(LIMITS).flatMap((limits) =>
    Object.values(limits).map((limit) => limit.windowSeconds),
  ),
)

/** Counts one check of each code in one atomic batch and answers the ids with checks left. */
export async function checkCodes(
  deps: Pick<Deps, 'db'>,
  tokenIds: readonly [number, ...number[]],
): Promise<Result<ReadonlySet<number>, InfraError>> {
  const { maxAttempts, windowSeconds } = CODE_CHECKS
  const currentTime = now()
  const count = (tokenId: number) =>
    recordAttempt(`code:${tokenId}`, 'otp_verify', windowSeconds, currentTime)
  const [first, ...rest] = tokenIds
  const recorded = await deps.db.batch([count(first), ...rest.map((tokenId) => count(tokenId))])
  return recorded.map(
    (counted) =>
      new Set(
        tokenIds.filter((_tokenId, index) => (counted[index]?.attemptCount ?? 1) <= maxAttempts),
      ),
  )
}
