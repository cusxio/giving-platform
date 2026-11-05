import { redirect } from '@tanstack/react-router'
import { setResponseHeader } from '@tanstack/react-start/server'
import { nanoid } from 'nanoid'
import { Type } from 'typebox'
import { Compile } from 'typebox/compile'

import { assertExhaustive } from '#/core/assert-exhaustive'
import { createDBError, createParseError, DBEmptyReturnError } from '#/core/errors'
import type { Result } from '#/core/result'
import { err, ok, trySync, tryAsync } from '#/core/result'
import type {
  BusinessErrorResponse,
  ServerErrorResponse,
  SuccessResponse,
  ValidationErrorResponse,
} from '#/core/wire'
import type { User } from '#/modules/account/server'
import { activateUser, findUserByEmail } from '#/modules/account/server'
import { constantTimeEqual } from '#/server/crypto.server'
import type { Deps } from '#/server/deps.server'
import type { RequestContext } from '#/server/request-context.server'

import type { AuthValidateOtpError } from './auth.errors'
import { checkOtpVerify, resetOtpVerify } from './rate-limit.server'
import { SESSION_MAX_AGE_SECONDS, serializeSessionCookie } from './session-cookie.server'
import { createSession } from './sessions.repository.server'
import { claimTokenIfUnused, findToken } from './tokens.repository.server'

type Ctx = Pick<RequestContext, 'deps' | 'user'>

const schema = Compile(
  Type.Object({
    email: Type.String({ format: 'email' }),
    mode: Type.Union([Type.Literal('login'), Type.Literal('signup')]),
    otp: Type.String({ pattern: '^[0-9]{6}$' }),
  }),
)

export type VerifyOtpInput = ReturnType<typeof schema.Parse>

export type VerifyOtpResponse =
  | BusinessErrorResponse<VerifyOtpBusinessErrorCode>
  | ServerErrorResponse
  | SuccessResponse
  | ValidationErrorResponse

type VerifyOtpBusinessErrorCode = 'INVALID_OR_EXPIRED_OTP' | 'RATE_LIMIT_EXCEEDED'

/**
 * Claims the user's newest unused code when it matches, then creates a session (and activates a
 * guest on signup) in one batch. Returns the serialized session cookie.
 */
export async function validateOtp(
  deps: Pick<Deps, 'db' | 'hashToken'>,
  email: User['email'],
  otp: string,
  mode: 'login' | 'signup',
): Promise<Result<string, AuthValidateOtpError>> {
  const userRes = await tryAsync(() => deps.db.run(findUserByEmail(email)), createDBError)

  if (!userRes.ok) {
    return userRes
  }

  const user = userRes.value

  if (user === null || (mode === 'signup' && user.status !== 'guest')) {
    return err({ type: 'InvalidRequestError' })
  }

  const tokenRes = await tryAsync(() => deps.db.run(findToken(user.id)), createDBError)

  if (!tokenRes.ok) {
    return tokenRes
  }

  const token = tokenRes.value

  if (token === null) {
    return err({ type: 'InvalidRequestError' })
  }

  if (token.mode !== mode) {
    return err({ type: 'InvalidRequestError' })
  }

  const isValid = constantTimeEqual(deps.hashToken(otp), token.tokenHash)

  if (!isValid) {
    return err({ type: 'InvalidOtpError' })
  }

  // The claim is a compare-and-set, so two concurrent requests cannot both use one code.
  const claimResult = await tryAsync(
    () => deps.db.run(claimTokenIfUnused(token.id, token.tokenHash)),
    createDBError,
  )

  if (!claimResult.ok) {
    return claimResult
  }

  if (!claimResult.value) {
    return err({ type: 'InvalidRequestError' })
  }

  const rawToken = nanoid()
  const sessionTokenHash = deps.hashToken(rawToken)
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000)
  const newSession = createSession({ expiresAt, tokenHash: sessionTokenHash, userId: user.id })

  const batchResult = await tryAsync(async () => {
    const [session] =
      mode === 'signup'
        ? await deps.db.batch([newSession, activateUser(user.id)])
        : await deps.db.batch([newSession])
    return session
  }, createDBError)

  if (!batchResult.ok) {
    return batchResult
  }

  const session = batchResult.value
  if (!session) {
    return err({ error: new DBEmptyReturnError(), type: 'DBEmptyReturnError' })
  }

  const cookieValue = serializeSessionCookie({
    cookieValue: `${session.id}.${rawToken}`,
    expiresAt,
  })

  return ok(cookieValue)
}

export async function verifyOtpProcedure(
  context: Ctx,
  data: VerifyOtpInput,
): Promise<undefined | VerifyOtpResponse> {
  const { deps, user } = context
  const { logger } = deps

  if (user !== null) {
    logger.info({ event: 'auth.verify_otp.redirected', user_id: user.id }, 'User already logged in')
    throw redirect({ to: '/' })
  }

  const parseResult = trySync(
    () => schema.Parse({ ...data, email: data.email.toLowerCase().trim() }),
    createParseError,
  )

  if (!parseResult.ok) {
    logger.warn(
      {
        err: parseResult.error.error,
        error_type: parseResult.error.type,
        event: 'auth.verify_otp.validation_failed',
      },
      'Input validation failed',
    )
    return {
      errors: parseResult.error.error.cause.errors.map((v) => ({
        path: v.instancePath,
        message: v.message,
      })),
      type: 'VALIDATION_ERROR',
    }
  }

  const { mode, otp, email } = parseResult.value

  const rateLimitResult = await checkOtpVerify(deps, email)
  if (!rateLimitResult.ok) {
    const { type } = rateLimitResult.error
    if (type === 'RateLimitExceededError') {
      logger.warn(
        {
          email,
          event: 'auth.verify_otp.rate_limited',
          retry_after_seconds: rateLimitResult.error.retryAfterSeconds,
        },
        'Rate limit exceeded for OTP verification',
      )
      return {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many attempts. Please try again in ${Math.ceil(rateLimitResult.error.retryAfterSeconds / 60)} minutes.`,
        },
        type: 'BUSINESS_ERROR',
      }
    }
    logger.error(
      {
        err: rateLimitResult.error.error,
        error_type: type,
        event: 'auth.verify_otp.rate_limit_check_failed',
      },
      'Rate limit check failed',
    )
    return { type: 'SERVER_ERROR' }
  }

  logger.info({ email, event: 'auth.verify_otp.attempt', mode }, 'Attempting to verify code')

  const userResult = await validateOtp(deps, email, otp, mode)

  if (!userResult.ok) {
    const { type } = userResult.error
    switch (type) {
      case 'InvalidOtpError':
      case 'InvalidRequestError': {
        // One error for the client, so a caller cannot tell a wrong code from a missing one.
        const reason = type === 'InvalidOtpError' ? 'wrong_code' : 'expired_or_missing'
        logger.warn({ email, event: 'auth.verify_otp.invalid', reason }, 'Invalid or expired code')
        return { error: { code: 'INVALID_OR_EXPIRED_OTP' }, type: 'BUSINESS_ERROR' }
      }
      case 'DBQueryError':
      case 'DBEmptyReturnError': {
        logger.error(
          {
            err: userResult.error.error,
            error_type: userResult.error.type,
            event: 'auth.verify_otp.failed',
          },
          'System Error during OTP verification',
        )
        return { type: 'SERVER_ERROR' }
      }
      default: {
        assertExhaustive(userResult.error)
      }
    }
  }

  setResponseHeader('Set-Cookie', userResult.value)

  const resetResult = await resetOtpVerify(deps, email)
  if (!resetResult.ok) {
    logger.error(
      {
        email,
        err: resetResult.error.error,
        error_type: resetResult.error.type,
        event: 'auth.verify_otp.rate_limit_reset_failed',
      },
      'Failed to reset rate limit after successful verification',
    )
  }

  logger.info(
    { email, event: 'auth.verify_otp.success', mode },
    'Verification success, session created',
  )

  return { type: 'SUCCESS' }
}
