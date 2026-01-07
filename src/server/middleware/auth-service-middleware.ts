import { createMiddleware } from '@tanstack/react-start'

import { AuthService } from '#/features/auth/auth.service'
import { TokenRepository } from '#/features/auth/token.repository'
import { EmailService } from '#/features/email/email.service'
import { SessionRepository } from '#/features/session/session.repository'
import { UserRepository } from '#/features/user/user.repository'

import { dbMiddleware } from './db-middleware'

export const authServiceMiddleware = createMiddleware()
  .middleware([dbMiddleware])
  .server(({ next, context }) => {
    const { db } = context
    const userRepository = new UserRepository(db)
    const tokenRepository = new TokenRepository(db)
    const sessionRepository = new SessionRepository(db)
    const emailService = new EmailService()
    const authService = new AuthService(
      db,
      { sessionRepository, tokenRepository, userRepository },
      { emailService },
    )

    return next({ context: { authService } })
  })
