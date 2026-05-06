import { redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
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
    mode: Type.Union([Type.Literal('signup'), Type.Literal('login')]),
  }),
)

export type RequestOtpInput = Static<typeof schema>

export type RequestOtpResponse =
  | BusinessErrorResponse<RequestOtpBusinessErrorCode>
  | ServerErrorResponse
  | SuccessResponse
  | ValidationErrorResponse

type RequestOtpBusinessErrorCode = 'ALREADY_EXISTS' | 'NOT_EXISTS' | 'RATE_LIMIT_EXCEEDED'

export const requestOtp = createServerFn({ method: 'POST' })
  .middleware([authServiceMiddleware])
  .inputValidator((v: RequestOtpInput) => v)
  .handler(async ({ data, context }): Promise<RequestOtpResponse | undefined> => {
    const { user, authService, rateLimitService, logger } = context

    if (user !== null) {
      logger.info(
        { event: 'auth.request_otp.redirected', user_id: user.id },
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
          event: 'auth.request_otp.validation_failed',
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

    const { email, mode } = parseResult.value

    // Check rate limit before processing
    const rateLimitResult = await rateLimitService.checkOtpRequest(email)
    if (!rateLimitResult.ok) {
      const { type } = rateLimitResult.error
      if (type === 'RateLimitExceededError') {
        logger.warn(
          {
            email,
            event: 'auth.request_otp.rate_limited',
            retry_after_seconds: rateLimitResult.error.retryAfterSeconds,
          },
          'Rate limit exceeded for OTP request',
        )
        return {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Too many requests. Please try again in ${Math.ceil(rateLimitResult.error.retryAfterSeconds / 60)} minutes.`,
          },
          type: 'BUSINESS_ERROR',
        }
      }
      // DB error
      logger.error(
        {
          err: rateLimitResult.error.error,
          error_type: type,
          event: 'auth.request_otp.rate_limit_check_failed',
        },
        'Rate limit check failed',
      )
      return { type: 'SERVER_ERROR' }
    }

    logger.info({ email, event: 'auth.request_otp.attempt', mode }, 'Initiating OTP request')

    const userResult =
      mode === 'signup' ? await authService.signup(email) : await authService.login(email)

    if (!userResult.ok) {
      const { type } = userResult.error
      switch (type) {
        case 'AlreadyExistsError': {
          logger.warn(
            { email, event: 'auth.request_otp.blocked', reason: 'exists' },
            'Signup blocked: User already exists',
          )
          return { error: { code: 'ALREADY_EXISTS' }, type: 'BUSINESS_ERROR' }
        }
        case 'NotExistsError': {
          logger.warn(
            { email, event: 'auth.request_otp.blocked', reason: 'not_found' },
            'Login blocked: User does not exist',
          )
          return { error: { code: 'NOT_EXISTS' }, type: 'BUSINESS_ERROR' }
        }
        case 'DBEmptyReturnError':
        case 'DBQueryError':
        case 'SendEmailError': {
          logger.error(
            {
              err: userResult.error.error,
              error_type: userResult.error.type,
              event: 'auth.request_otp.failed',
            },
            'System Error during OTP request',
          )
          return { type: 'SERVER_ERROR' }
        }
        default: {
          assertExhaustive(userResult.error)
        }
      }
    }

    logger.info({ email, event: 'auth.request_otp.success', mode }, 'OTP sent successfully')

    return { type: 'SUCCESS' }
  })
