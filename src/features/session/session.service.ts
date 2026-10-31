import { addSeconds, differenceInDays, now } from '#/core/date'
import { createParseError } from '#/core/errors'
import type { Result } from '#/core/result'
import { err, ok, trySync } from '#/core/result'
import { constantTimeEqual, createTokenHasher } from '#/server/crypto.server'
import { SESSION_SECRET } from '#/server/env.server'
import { logger } from '#/server/logger.server'
import type { Session, User } from '#/server/schema.server'

import { SESSION_MAX_AGE_SECONDS } from './constants'
import type { VerificationError } from './session.errors'
import type { SessionRepository } from './session.repository'
import { clearSessionCookie, cookieValueSchema, serializeSessionCookie } from './utils'

const hashToken = createTokenHasher(SESSION_SECRET)

export class SessionService {
  readonly #sessionRepository: SessionRepository

  constructor(sessionRepository: SessionRepository) {
    this.#sessionRepository = sessionRepository
  }

  async verifyCookieSession(
    cookieValue: string,
  ): Promise<
    Result<
      {
        serializedCookie: null | string
        session: Pick<Session, 'expiresAt' | 'id' | 'tokenHash'>
        user: Pick<User, 'id' | 'journey' | 'role'>
      },
      VerificationError
    >
  > {
    const parts = cookieValue.split('.')

    const parseResult = trySync(
      () => cookieValueSchema.Parse({ rawToken: parts[1], sessionId: parts[0] }),
      createParseError,
    )

    if (!parseResult.ok) {
      return parseResult
    }

    const { rawToken, sessionId } = parseResult.value
    const sessionWithUserResult = await this.#sessionRepository.findSessionByIdWithUser(sessionId)

    if (!sessionWithUserResult.ok) {
      return sessionWithUserResult
    }

    const sessionWithUser = sessionWithUserResult.value

    if (sessionWithUser === null) {
      return err({ serializedCookie: clearSessionCookie(), type: 'SessionNotFoundError' })
    }

    const { session, user } = sessionWithUser

    const isValid = constantTimeEqual(hashToken(rawToken), session.tokenHash)

    if (!isValid) {
      return err({ serializedCookie: clearSessionCookie(), type: 'SessionInvalidError' })
    }

    if (user.status !== 'active') {
      const deleteResult = await this.#sessionRepository.deleteSessionById(session.id)

      if (!deleteResult.ok) {
        logger.warn(
          {
            err: deleteResult.error.error,
            error_type: deleteResult.error.type,
            event: 'session.verify.inactive_delete_failed',
            session_id: session.id,
          },
          'Failed to delete session of inactive user',
        )
      }

      return err({ serializedCookie: clearSessionCookie(), type: 'SessionUserInactiveError' })
    }

    const daysLeft = differenceInDays(session.expiresAt, now())

    if (daysLeft <= 0) {
      return err({ serializedCookie: clearSessionCookie(), type: 'SessionExpiredError' })
    }

    if (daysLeft <= 7) {
      const extendedExpiresAt = addSeconds(now(), SESSION_MAX_AGE_SECONDS)

      this.#sessionRepository
        .extendSession(session.id, extendedExpiresAt)
        .then((res) => {
          if (res.ok) {
            logger.info(
              {
                event: 'session.extend.background_success',
                session_id: session.id,
                user_id: user.id,
              },
              'Session extended successfully in background',
            )
          } else {
            logger.warn(
              {
                err: res.error.error,
                error_type: res.error.type,
                event: 'session.extend.background_failed',
                session_id: session.id,
              },
              'Database rejected session extension',
            )
          }
        })
        .catch((error: unknown) => {
          logger.error(
            { err: error, event: 'session.extend.background_crash', session_id: session.id },
            'Critical error during background session extension',
          )
        })

      const newCookieValue = serializeSessionCookie({ cookieValue, expiresAt: extendedExpiresAt })

      return ok({
        serializedCookie: newCookieValue,
        session: { ...session, expiresAt: extendedExpiresAt },
        user,
      })
    }

    // Session is valid and doesn't need to be extended
    return ok({ serializedCookie: null, session, user })
  }
}
