import { redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import type { Static } from 'typebox'
import { Type } from 'typebox'
import { Compile } from 'typebox/compile'

import { assertExhaustive } from '#/core/assert-exhaustive'
import { createParseError } from '#/core/errors'
import type {
  BusinessErrorResponse,
  ServerErrorResponse,
  SuccessResponse,
  ValidationErrorResponse,
} from '#/core/procedure-response-types'
import { trySync } from '#/core/result'
import { authServiceMiddleware } from '#/server/middleware'

const schema = Compile(
  Type.Object({
    email: Type.String({ format: 'email' }),
    mode: Type.Union([Type.Literal('login'), Type.Literal('signup')]),
    otp: Type.String({ pattern: '^[0-9]{6}$' }),
  }),
)

export type VerifyOtpInput = Static<typeof schema>

export type VerifyOtpResponse =
  | BusinessErrorResponse<VerifyOtpBusinessErrorCode>
  | ServerErrorResponse
  | SuccessResponse
  | ValidationErrorResponse

type VerifyOtpBusinessErrorCode = 'INVALID_OR_EXPIRED_OTP' | 'RATE_LIMIT_EXCEEDED'

export const verifyOtp = createServerFn({ method: 'POST' })
  .middleware([authServiceMiddleware])
  .inputValidator((v: VerifyOtpInput) => v)
  .handler(async ({ context, data }): Promise<undefined | VerifyOtpResponse> => {
    const { user, authService, rateLimitService, logger } = context

    if (user !== null) {
      logger.info(
        { event: 'auth.verify_otp.redirected', user_id: user.id },
        'User already logged in',
      )
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

    // Check rate limit before processing
    const rateLimitResult = await rateLimitService.checkOtpVerify(email)
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
      // DB error
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

    const userResult = await authService.validateOtp(email, otp, mode)

    if (!userResult.ok) {
      const { type } = userResult.error
      switch (type) {
        case 'InvalidOtpError':
        case 'InvalidRequestError': {
          // Log the specific reason internally, but return a unified error to the client
          // To prevent user enumeration (attacker can't tell if code was wrong vs expired/missing)
          const reason = type === 'InvalidOtpError' ? 'wrong_code' : 'expired_or_missing'
          logger.warn(
            { email, event: 'auth.verify_otp.invalid', reason },
            'Invalid or expired code',
          )
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

    const serializedCookie = userResult.value
    setResponseHeader('Set-Cookie', serializedCookie)

    // Reset rate limit on successful verification
    const resetResult = await rateLimitService.resetOtpVerify(email)
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
  })
