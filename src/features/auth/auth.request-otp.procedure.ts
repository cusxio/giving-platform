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

type RequestOtpBusinessErrorCode = 'ALREADY_EXISTS' | 'NOT_EXISTS'

export const requestOtp = createServerFn({ method: 'POST' })
  .middleware([authServiceMiddleware])
  .inputValidator((v: RequestOtpInput) => v)
  .handler(
    async ({ data, context }): Promise<RequestOtpResponse | undefined> => {
      const { session, authService, logger } = context

      if (session !== null) {
        logger.info(
          { event: 'auth.request_otp.redirected', user_id: session.userId },
          'User already logged in',
        )
        throw redirect({ to: '/' })
      }

      const parseResult = trySync(() => schema.Parse(data), createParseError)

      if (!parseResult.ok) {
        logger.warn(
          {
            event: 'auth.request_otp.validation_failed',
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

      const { email, mode } = parseResult.value

      logger.info(
        { event: 'auth.request_otp.attempt', email, mode },
        'Initiating OTP request',
      )

      const userResult =
        mode === 'signup'
          ? await authService.signup(email)
          : await authService.login(email)

      if (!userResult.ok) {
        const { type } = userResult.error
        switch (type) {
          case 'AlreadyExistsError': {
            logger.warn(
              { event: 'auth.request_otp.blocked', email, reason: 'exists' },
              'Signup blocked: User already exists',
            )
            return { type: 'BUSINESS_ERROR', error: { code: 'ALREADY_EXISTS' } }
          }
          case 'NotExistsError': {
            logger.warn(
              { event: 'auth.request_otp.blocked', email, reason: 'not_found' },
              'Login blocked: User does not exist',
            )
            return { type: 'BUSINESS_ERROR', error: { code: 'NOT_EXISTS' } }
          }
          case 'DBEmptyReturnError':
          case 'DBQueryError':
          case 'SendEmailError': {
            logger.error(
              {
                event: 'auth.request_otp.failed',
                err: userResult.error.error,
                error_type: userResult.error.type,
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

      logger.info(
        { event: 'auth.request_otp.success', email, mode },
        'OTP sent successfully',
      )

      return { type: 'SUCCESS' }
    },
  )
