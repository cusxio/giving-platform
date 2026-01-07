import { constantTimeEqual } from '@oslojs/crypto/subtle'
import { render, toPlainText } from '@react-email/components'
import { nanoid } from 'nanoid'
import { createElement } from 'react'

import { config } from '#/core/brand'
import { createTransactionError } from '#/core/errors'
import { hashToken } from '#/core/hash-token'
import type { Result } from '#/core/result'
import { err, ok, tryAsync } from '#/core/result'
import type { DBPool } from '#/db/client'
import { DBEmptyReturnError, TransactionRollbackError } from '#/db/errors'
import type { Session, User } from '#/db/schema'

import type { EmailService, SendEmailError } from '../email/email.service'
import EmailVerification from '../email/templates/email-verification'
import Login from '../email/templates/login'
import { SESSION_MAX_AGE_SECONDS } from '../session/constants'
import type { SessionRepository } from '../session/session.repository'
import { serializeSessionCookie } from '../session/utils'
import type { UserRepository } from '../user/user.repository'

import type {
  AuthLoginError,
  AuthSignUpError,
  AuthValidateOtpError,
} from './auth.errors'
import type { TokenRepository } from './token.repository'
import { generateOtp } from './utils'

export class AuthService {
  #dbPool: DBPool
  #emailService: EmailService
  #sessionRepository: SessionRepository
  #tokenRepository: TokenRepository
  #userRepository: UserRepository

  constructor(
    dbPool: DBPool,
    repositories: {
      sessionRepository: SessionRepository
      tokenRepository: TokenRepository
      userRepository: UserRepository
    },
    services: { emailService: EmailService },
  ) {
    const { sessionRepository, tokenRepository, userRepository } = repositories
    const { emailService } = services
    this.#sessionRepository = sessionRepository
    this.#tokenRepository = tokenRepository
    this.#userRepository = userRepository
    this.#emailService = emailService
    this.#dbPool = dbPool
  }

  async login(
    email: User['email'],
  ): Promise<Result<void, AuthLoginError | SendEmailError>> {
    const userRes = await this.#userRepository.findUserByEmail(email)

    if (!userRes.ok) {
      return userRes
    }

    const user = userRes.value

    if (user?.status !== 'active') {
      return err({ type: 'NotExistsError' })
    }

    const sendRes = await this.#generateOtpForUser(user.id, user.email, 'login')

    if (!sendRes.ok) return sendRes

    return ok()
  }

  async logout(sessionId: Session['id']) {
    return this.#sessionRepository.deleteSessionById(sessionId)
  }

  async signup(
    email: User['email'],
  ): Promise<Result<void, AuthSignUpError | SendEmailError>> {
    const userRes = await this.#userRepository.findUserByEmail(email)

    if (!userRes.ok) return userRes

    let user = userRes.value

    if (user === null) {
      const createRes = await this.#userRepository.createUser({ email })

      if (!createRes.ok) return createRes

      user = createRes.value
      if (user === null) {
        return err({
          type: 'DBEmptyReturnError',
          error: new DBEmptyReturnError(),
        })
      }
    }

    if (user.status === 'active') {
      return err({ type: 'AlreadyExistsError' })
    }

    const sendRes = await this.#generateOtpForUser(
      user.id,
      user.email,
      'signup',
    )

    if (!sendRes.ok) return sendRes

    return ok()
  }

  async validateOtp(
    email: User['email'],
    otp: string,
    mode: 'login' | 'signup',
  ): Promise<Result<string, AuthValidateOtpError>> {
    const userRes = await this.#userRepository.findUserByEmail(email)

    if (!userRes.ok) return userRes

    const user = userRes.value

    if (user === null) {
      return err({ type: 'InvalidRequestError' })
    }

    const tokenRes = await this.#tokenRepository.findToken(user.id)

    if (!tokenRes.ok) return tokenRes

    const token = tokenRes.value

    if (token === null) {
      return err({ type: 'InvalidRequestError' })
    }

    const expectedTokenHash = hashToken(otp)

    const encoder = new TextEncoder()
    const isValid = constantTimeEqual(
      encoder.encode(expectedTokenHash),
      encoder.encode(token.tokenHash),
    )

    if (!isValid) {
      return err({ type: 'InvalidOtpError' })
    }

    const rawToken = nanoid()
    const tokenHash = hashToken(rawToken)
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000)

    const txResult = await tryAsync(async () => {
      return await this.#dbPool.transaction(async (tx) => {
        if (mode === 'signup') {
          const markUserResult =
            await this.#userRepository.markUserAsActiveById(user.id, tx)

          if (!markUserResult.ok) {
            throw new TransactionRollbackError('Error marking user as active', {
              cause: markUserResult.error,
            })
          }
        }

        const markTokenResult = await this.#tokenRepository.markTokenAsUsed(
          token.tokenHash,
          tx,
        )

        if (!markTokenResult.ok) {
          throw new TransactionRollbackError('Error marking token as used', {
            cause: markTokenResult.error,
          })
        }

        const sessionResult = await this.#sessionRepository.createSession(
          { tokenHash, userId: user.id, expiresAt },
          tx,
        )

        if (!sessionResult.ok) {
          throw new TransactionRollbackError('Error creating session', {
            cause: sessionResult.error,
          })
        }

        const session = sessionResult.value
        if (session === null) {
          throw new TransactionRollbackError(
            'Session creation returned no result',
          )
        }

        return session
      })
    }, createTransactionError)

    if (!txResult.ok) return txResult

    const cookieValue = serializeSessionCookie({
      expiresAt,
      cookieValue: `${txResult.value.id}.${rawToken}`,
    })

    return ok(cookieValue)
  }

  async #generateOtpForUser(
    userId: User['id'],
    email: User['email'],
    mode: 'login' | 'signup',
  ) {
    const otp = generateOtp()
    const tokenRes = await this.#tokenRepository.createToken(
      userId,
      hashToken(otp),
    )

    if (!tokenRes.ok) return tokenRes

    const template = mode === 'login' ? Login : EmailVerification
    const html = await render(createElement(template, { otp }))
    const text = toPlainText(html)
    const subject =
      mode === 'signup'
        ? `${config.name} Sign Up Verification`
        : `Login for ${config.name}`
    const emailRes = await this.#emailService.sendEmail({
      to: email,
      html,
      text,
      subject,
    })

    if (!emailRes.ok) return emailRes

    return ok()
  }
}
