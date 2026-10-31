import { Result } from 'better-result'
import { createElement } from 'react'
import { render, toPlainText } from 'react-email'
import { Type } from 'typebox'
import { Compile } from 'typebox/compile'

import { config } from '#/core/brand'
import type { User } from '#/modules/account/server'
import { findUserByEmail, upsertGuestUser } from '#/modules/account/server'
import { anonymousOnly } from '#/server/authorize.server'
import type { Deps } from '#/server/deps.server'
import { infra } from '#/server/infra-error'
import type { Parsed } from '#/server/input.server'
import { parseWith } from '#/server/input.server'
import { business, defineMutation } from '#/server/procedure.server'

import { AlreadyExistsError, NotExistsError } from './auth.errors'
import EmailVerification from './emails/email-verification'
import Login from './emails/login'
import { generateOtp } from './otp-code.server'
import { checkOtpRequest } from './rate-limit.server'
import { createToken } from './tokens.repository.server'

type OtpDeps = Pick<Deps, 'db' | 'hashToken' | 'logger' | 'mailer'>

const requestOtpInput = parseWith(
  Compile(
    Type.Object({
      email: Type.String({ format: 'email' }),
      mode: Type.Union([Type.Literal('signup'), Type.Literal('login')]),
    }),
  ),
  { lowercase: ['email'], trim: ['email'] },
)
export type RequestOtpInput = Parsed<typeof requestOtpInput>

/**
 * The account a signup code is for: the email's row, or a new guest row for a new email. The
 * upsert returns no row when the email was registered after the lookup, such as by a signup
 * activating in between, so it is answered as the registered account it now is.
 */
function signupAccount(deps: OtpDeps, email: User['email']) {
  return Result.gen(async function* account() {
    const found = yield* Result.await(deps.db.run(findUserByEmail(email)))
    if (found !== null) {
      return Result.ok(found)
    }
    const created = yield* Result.await(deps.db.run(upsertGuestUser({ email })))
    return created === null ? Result.err(new AlreadyExistsError()) : Result.ok(created)
  })
}

/** Stores the hash of a new code and emails the code. */
async function sendOtp(deps: OtpDeps, user: User, mode: RequestOtpInput['mode']) {
  const otp = generateOtp()
  const stored = await deps.db.run(createToken(user.id, deps.hashToken(otp), mode))
  if (stored.isErr()) {
    return stored
  }
  const template = mode === 'login' ? Login : EmailVerification
  const html = await render(createElement(template, { otp }))
  const subject =
    mode === 'signup' ? `${config.name} Sign Up Verification` : `Login for ${config.name}`
  return Result.tryPromise({
    catch: (cause) => infra('mailer.send', cause),
    try: () => deps.mailer.send({ html, subject, text: toPlainText(html), to: user.email }),
  })
}

/**
 * Emails a login code to an active user, and a signup code to a new email or a guest. A signup
 * for a suspended or deleted account answers as if a code was sent, and sends none.
 */
function requestCode(deps: OtpDeps, { email, mode }: RequestOtpInput) {
  return Result.gen(async function* request() {
    yield* Result.await(checkOtpRequest(deps, email))
    deps.logger.info({ email, event: 'auth.request_otp.attempt', mode }, 'Initiating OTP request')

    let user: User
    if (mode === 'login') {
      const found = yield* Result.await(deps.db.run(findUserByEmail(email)))
      if (found?.status !== 'active') {
        return Result.err(new NotExistsError())
      }
      user = found
    } else {
      user = yield* Result.await(signupAccount(deps, email))
      if (user.status === 'active') {
        return Result.err(new AlreadyExistsError())
      }
      if (user.status !== 'guest') {
        deps.logger.warn(
          { email, event: 'auth.request_otp.blocked', reason: 'inactive' },
          'Signup blocked: User is suspended or deleted',
        )
        // The response matches a real signup. Timing still differs, as no email is sent.
        return Result.ok()
      }
    }

    yield* Result.await(sendOtp(deps, user, mode))
    deps.logger.info({ email, event: 'auth.request_otp.success', mode }, 'OTP sent successfully')
    return Result.ok()
  })
}

export const requestOtpAction = defineMutation({
  auth: anonymousOnly,
  event: 'auth.request_otp',
  input: requestOtpInput,
  run: ({ deps }, input) => requestCode(deps, input),
  wire: {
    AlreadyExistsError: (_error, { email }) =>
      business('ALREADY_EXISTS', {
        event: 'auth.request_otp.blocked',
        fields: { email, reason: 'exists' },
        msg: 'Signup blocked: User already exists',
      }),
    NotExistsError: (_error, { email }) =>
      business('NOT_EXISTS', {
        event: 'auth.request_otp.blocked',
        fields: { email, reason: 'not_found' },
        msg: 'Login blocked: User does not exist',
      }),
    RateLimitExceededError: ({ retryAfterSeconds }, { email }) =>
      business(
        'RATE_LIMIT_EXCEEDED',
        {
          event: 'auth.request_otp.rate_limited',
          fields: { email, retry_after_seconds: retryAfterSeconds },
          msg: 'Rate limit exceeded for OTP request',
        },
        `Too many requests. Please try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
      ),
  },
})

export type RequestOtpResponse = Awaited<ReturnType<typeof requestOtpAction>>
