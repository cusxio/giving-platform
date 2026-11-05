import { getRequest, setResponseHeader } from '@tanstack/react-start/server'
import { Result } from 'better-result'
import { nanoid } from 'nanoid'
import { Type } from 'typebox'
import { Compile } from 'typebox/compile'

import type { User } from '#/modules/account/server'
import { activateUser, findUserByEmail } from '#/modules/account/server'
import { anonymousOnly } from '#/server/authorize.server'
import { constantTimeEqual } from '#/server/crypto.server'
import type { Deps } from '#/server/deps.server'
import { required } from '#/server/infra-error'
import type { Parsed } from '#/server/input.server'
import { parseWith } from '#/server/input.server'
import { business, defineMutation, logInfraEvent } from '#/server/procedure.server'

import { CodeExhaustedError, InvalidOtpError, InvalidRequestError } from './auth.errors'
import { checkCodes, checkOtpVerify, limitedAddress, resetOtpVerify } from './rate-limit.server'
import { SESSION_MAX_AGE_SECONDS, serializeSessionCookie } from './session-cookie.server'
import { createSession } from './sessions.repository.server'
import type { Token } from './tokens.repository.server'
import { claimTokenIfUnused, findLiveTokens } from './tokens.repository.server'

type VerifyDeps = Pick<Deps, 'db' | 'hashToken' | 'logger'>

const verifyOtpInput = parseWith(
  Compile(
    Type.Object({
      email: Type.String({ format: 'email', maxLength: 254 }),
      mode: Type.Union([Type.Literal('login'), Type.Literal('signup')]),
      otp: Type.String({ pattern: '^[0-9]{6}$' }),
    }),
  ),
  { lowercase: ['email'], trim: ['email'] },
)
export type VerifyOtpInput = Parsed<typeof verifyOtpInput>

/** A login code signs in an active account; a signup code activates a guest. */
const mayUse = (user: User, mode: VerifyOtpInput['mode']) =>
  user.status === (mode === 'login' ? 'active' : 'guest')

/** At most one code matches: a user's codes have distinct hashes (`tokens_token_hash_user_id_idx`). */
function matchCode(
  tokens: readonly Token[],
  withChecksLeft: ReadonlySet<Token['id']>,
  hash: string,
) {
  const match = tokens.find((token) => constantTimeEqual(hash, token.tokenHash))
  if (match !== undefined && withChecksLeft.has(match.id)) {
    return Result.ok(match)
  }
  if (match !== undefined || withChecksLeft.size === 0) {
    return Result.err(new CodeExhaustedError())
  }
  return Result.err(new InvalidOtpError())
}

/**
 * Claims the user's live code of `mode` that matches and has checks left, then creates a session
 * (and activates a guest on signup) in one batch. Returns the serialized session cookie. Every
 * live code is counted before any is compared, so a guess spends one check of each.
 */
function validateOtp(deps: VerifyDeps, { email, mode, otp }: VerifyOtpInput) {
  return Result.gen(async function* validate() {
    const user = yield* Result.await(deps.db.run(findUserByEmail(email)))
    if (user === null || !mayUse(user, mode)) {
      return Result.err(new InvalidRequestError())
    }

    const [first, ...rest] = yield* Result.await(deps.db.run(findLiveTokens(user.id, mode)))
    if (first === undefined) {
      return Result.err(new InvalidRequestError())
    }
    const withChecksLeft = yield* Result.await(
      checkCodes(deps, [first.id, ...rest.map((token) => token.id)]),
    )
    const token = yield* matchCode([first, ...rest], withChecksLeft, deps.hashToken(otp))

    // The claim is a compare-and-set, so two concurrent requests cannot both use one code.
    const claimed = yield* Result.await(deps.db.run(claimTokenIfUnused(token.id, token.tokenHash)))
    if (!claimed) {
      return Result.err(new InvalidRequestError())
    }

    const rawToken = nanoid()
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000)
    const newSession = createSession({
      expiresAt,
      tokenHash: deps.hashToken(rawToken),
      userId: user.id,
    })
    const inserted = yield* Result.await(
      mode === 'signup'
        ? deps.db.batch([newSession, activateUser(user.id)]).then((r) => r.map(([row]) => row))
        : deps.db.batch([newSession]).then((r) => r.map(([row]) => row)),
    )
    const session = yield* required(inserted, createSession.queryName)

    return Result.ok(
      serializeSessionCookie({ cookieValue: `${session.id}.${rawToken}`, expiresAt }),
    )
  })
}

/** Checks the attempt count and the code, and answers the new session's cookie. */
function verifyCode(deps: VerifyDeps, input: VerifyOtpInput, ip: null | string) {
  const { email, mode } = input
  return Result.gen(async function* verify() {
    yield* Result.await(checkOtpVerify(deps, email, ip))
    deps.logger.info({ email, event: 'auth.verify_otp.attempt', mode }, 'Attempting to verify code')

    const cookie = yield* Result.await(validateOtp(deps, input))

    const reset = await resetOtpVerify(deps, email, ip)
    if (reset.isErr()) {
      logInfraEvent(deps.logger, reset.error, {
        event: 'auth.verify_otp.rate_limit_reset_failed',
        fields: { email },
        level: 'error',
        msg: 'Failed to reset rate limit after successful verification',
      })
    }
    deps.logger.info(
      { email, event: 'auth.verify_otp.success', mode },
      'Verification success, session created',
    )
    return Result.ok(cookie)
  })
}

/** One answer for a wrong code and a missing one, so a caller cannot tell them apart. */
const invalid = (email: string, reason: 'code_exhausted' | 'expired_or_missing' | 'wrong_code') =>
  business('INVALID_OR_EXPIRED_OTP', {
    event: 'auth.verify_otp.invalid',
    fields: { email, reason },
    msg: 'Invalid or expired code',
  })

export const verifyOtpAction = defineMutation({
  auth: anonymousOnly,
  event: 'auth.verify_otp',
  input: verifyOtpInput,
  run: async ({ deps }, input) => {
    const verified = await verifyCode(
      deps,
      input,
      limitedAddress(deps.logger, getRequest().headers),
    )
    if (verified.isErr()) {
      return Result.err(verified.error)
    }
    setResponseHeader('Set-Cookie', verified.value)
    return Result.ok()
  },
  wire: {
    CodeExhaustedError: (_error, { email }) => invalid(email, 'code_exhausted'),
    InvalidOtpError: (_error, { email }) => invalid(email, 'wrong_code'),
    InvalidRequestError: (_error, { email }) => invalid(email, 'expired_or_missing'),
    RateLimitExceededError: ({ ip, retryAfterSeconds }, { email }) =>
      business(
        'RATE_LIMIT_EXCEEDED',
        {
          event: 'auth.verify_otp.rate_limited',
          fields: { email, ...(ip !== null && { ip }), retry_after_seconds: retryAfterSeconds },
          msg: 'Rate limit exceeded for OTP verification',
        },
        `Too many attempts. Please try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
      ),
  },
})

export type VerifyOtpResponse = Awaited<ReturnType<typeof verifyOtpAction>>
