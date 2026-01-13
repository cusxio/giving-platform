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
    otp: Type.String({ pattern: '^[0-9]{6}$' }),
    email: Type.String({ format: 'email' }),
    mode: Type.Union([Type.Literal('login'), Type.Literal('signup')]),
  }),
)

export type VerifyOtpInput = Static<typeof schema>

export type VerifyOtpResponse =
  | BusinessErrorResponse<VerifyOtpBusinessErrorCode>
  | ServerErrorResponse
  | SuccessResponse
  | ValidationErrorResponse

type VerifyOtpBusinessErrorCode =
  | 'INVALID_OR_EXPIRED_OTP'
  | 'RATE_LIMIT_EXCEEDED'

export const verifyOtp = createServerFn({ method: 'POST' })
  .middleware([authServiceMiddleware])
  .inputValidator((v: VerifyOtpInput) => v)
  .handler(
    async ({ context, data }): Promise<undefined | VerifyOtpResponse> => {
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
            event: 'auth.verify_otp.validation_failed',
            err: parseResult.error.error,
            error_type: parseResult.error.type,
          },
          'Input validation failed',
        )
        return {
          type: 'VALIDATION_ERROR',
          errors: parseResult.error.error.cause.errors.map((v) => {
            return { path: v.instancePath, message: v.message }
          }),
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
              event: 'auth.verify_otp.rate_limited',
              email,
              retry_after_seconds: rateLimitResult.error.retryAfterSeconds,
            },
            'Rate limit exceeded for OTP verification',
          )
          return {
            type: 'BUSINESS_ERROR',
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: `Too many attempts. Please try again in ${Math.ceil(rateLimitResult.error.retryAfterSeconds / 60)} minutes.`,
            },
          }
        }
        // DB error
        logger.error(
          {
            event: 'auth.verify_otp.rate_limit_check_failed',
            err: rateLimitResult.error.error,
            error_type: type,
          },
          'Rate limit check failed',
        )
        return { type: 'SERVER_ERROR' }
      }

      logger.info(
        { event: 'auth.verify_otp.attempt', email, mode },
        'Attempting to verify code',
      )

      const userResult = await authService.validateOtp(email, otp, mode)

      if (!userResult.ok) {
        const { type } = userResult.error
        switch (type) {
          case 'InvalidOtpError':
          case 'InvalidRequestError': {
            // Log the specific reason internally, but return a unified error to the client
            // to prevent user enumeration (attacker can't tell if code was wrong vs expired/missing)
            const reason =
              type === 'InvalidOtpError' ? 'wrong_code' : 'expired_or_missing'
            logger.warn(
              { event: 'auth.verify_otp.invalid', email, reason },
              'Invalid or expired code',
            )
            return {
              type: 'BUSINESS_ERROR',
              error: { code: 'INVALID_OR_EXPIRED_OTP' },
            }
          }
          case 'DBQueryError':
          case 'DBEmptyReturnError': {
            logger.error(
              {
                event: 'auth.verify_otp.failed',
                err: userResult.error.error,
                error_type: userResult.error.type,
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
            event: 'auth.verify_otp.rate_limit_reset_failed',
            err: resetResult.error.error,
            error_type: resetResult.error.type,
            email,
          },
          'Failed to reset rate limit after successful verification',
        )
      }

      logger.info(
        { event: 'auth.verify_otp.success', email, mode },
        'Verification success, session created',
      )

      return { type: 'SUCCESS' }
    },
  )
