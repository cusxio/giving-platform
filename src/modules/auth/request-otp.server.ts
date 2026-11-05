import { redirect } from '@tanstack/react-router'
import { createElement } from 'react'
import { render, toPlainText } from 'react-email'
import { Type } from 'typebox'
import { Compile } from 'typebox/compile'

import { assertExhaustive } from '#/core/assert-exhaustive'
import { config } from '#/core/brand'
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
import { findUserByEmail, upsertGuestUser } from '#/modules/account/server'
import type { Deps } from '#/server/deps.server'
import type { RequestContext } from '#/server/request-context.server'

import type { AuthLoginError, AuthSignUpError, SendEmailError } from './auth.errors'
import EmailVerification from './emails/email-verification'
import Login from './emails/login'
import { generateOtp } from './otp-code.server'
import { checkOtpRequest } from './rate-limit.server'
import { createToken } from './tokens.repository.server'

type Ctx = Pick<RequestContext, 'deps' | 'user'>

type OtpDeps = Pick<Deps, 'db' | 'hashToken' | 'mailer'>

const schema = Compile(
  Type.Object({
    email: Type.String({ format: 'email' }),
    mode: Type.Union([Type.Literal('signup'), Type.Literal('login')]),
  }),
)

export type RequestOtpInput = ReturnType<typeof schema.Parse>

export type RequestOtpResponse =
  | BusinessErrorResponse<RequestOtpBusinessErrorCode>
  | ServerErrorResponse
  | SuccessResponse
  | ValidationErrorResponse

type RequestOtpBusinessErrorCode = 'ALREADY_EXISTS' | 'NOT_EXISTS' | 'RATE_LIMIT_EXCEEDED'

/** Emails a login code to an active user. Anyone else is reported as not existing. */
export async function login(
  deps: OtpDeps,
  email: User['email'],
): Promise<Result<void, AuthLoginError | SendEmailError>> {
  const userRes = await tryAsync(() => deps.db.run(findUserByEmail(email)), createDBError)

  if (!userRes.ok) {
    return userRes
  }

  const user = userRes.value

  if (user?.status !== 'active') {
    return err({ type: 'NotExistsError' })
  }

  const sendRes = await sendOtp(deps, user.id, user.email, 'login')

  if (!sendRes.ok) {
    return sendRes
  }

  return ok()
}

/** Emails a signup code to a new email or a guest, creating the guest row for a new email. */
export async function signup(
  deps: OtpDeps,
  email: User['email'],
): Promise<Result<void, AuthSignUpError | SendEmailError>> {
  const userRes = await tryAsync(() => deps.db.run(findUserByEmail(email)), createDBError)

  if (!userRes.ok) {
    return userRes
  }

  let user = userRes.value

  if (user === null) {
    const createRes = await tryAsync(() => deps.db.run(upsertGuestUser({ email })), createDBError)

    if (!createRes.ok) {
      return createRes
    }

    user = createRes.value
    if (user === null) {
      return err({ error: new DBEmptyReturnError(), type: 'DBEmptyReturnError' })
    }
  }

  if (user.status === 'active') {
    return err({ type: 'AlreadyExistsError' })
  }

  if (user.status !== 'guest') {
    return err({ type: 'InactiveAccountError' })
  }

  const sendRes = await sendOtp(deps, user.id, user.email, 'signup')

  if (!sendRes.ok) {
    return sendRes
  }

  return ok()
}

async function sendOtp(
  deps: OtpDeps,
  userId: User['id'],
  email: User['email'],
  mode: 'login' | 'signup',
) {
  const otp = generateOtp()
  const tokenRes = await tryAsync(
    () => deps.db.run(createToken(userId, deps.hashToken(otp), mode)),
    createDBError,
  )

  if (!tokenRes.ok) {
    return tokenRes
  }

  const template = mode === 'login' ? Login : EmailVerification
  const html = await render(createElement(template, { otp }))
  const text = toPlainText(html)
  const subject =
    mode === 'signup' ? `${config.name} Sign Up Verification` : `Login for ${config.name}`
  const emailRes = await tryAsync(
    () => deps.mailer.send({ html, subject, text, to: email }),
    (error: unknown): SendEmailError => ({ error, type: 'SendEmailError' }),
  )

  if (!emailRes.ok) {
    return emailRes
  }

  return ok()
}

export async function requestOtpProcedure(
  context: Ctx,
  data: RequestOtpInput,
): Promise<RequestOtpResponse | undefined> {
  const { deps, user } = context
  const { logger } = deps

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

  const rateLimitResult = await checkOtpRequest(deps, email)
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

  const userResult = mode === 'signup' ? await signup(deps, email) : await login(deps, email)

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
      case 'InactiveAccountError': {
        logger.warn(
          { email, event: 'auth.request_otp.blocked', reason: 'inactive' },
          'Signup blocked: User is suspended or deleted',
        )
        // The response body matches a real signup. Timing still differs, as no email is sent.
        return { type: 'SUCCESS' }
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
}
