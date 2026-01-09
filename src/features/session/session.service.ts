import { constantTimeEqual } from '@oslojs/crypto/subtle'

import { addSeconds, differenceInDays, now } from '#/core/date'
import { createParseError } from '#/core/errors'
import { hashToken } from '#/core/hash-token'
import { logger } from '#/core/logger'
import type { Result } from '#/core/result'
import { err, ok, trySync } from '#/core/result'
import type { Session, User } from '#/db/schema'

import { SESSION_MAX_AGE_SECONDS } from './constants'
import type { VerificationError } from './session.errors'
import type { SessionRepository } from './session.repository'
import {
  clearSessionCookie,
  cookieValueSchema,
  serializeSessionCookie,
} from './utils'

export class SessionService {
  #sessionRepository: SessionRepository

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
      () =>
        cookieValueSchema.Parse({ sessionId: parts[0], rawToken: parts[1] }),
      createParseError,
    )

    if (!parseResult.ok) {
      return parseResult
    }

    const { rawToken, sessionId } = parseResult.value
    const sessionWithUserResult =
      await this.#sessionRepository.findSessionByIdWithUser(sessionId)

    if (!sessionWithUserResult.ok) {
      return sessionWithUserResult
    }

    const sessionWithUser = sessionWithUserResult.value

    if (sessionWithUser === null) {
      return err({
        type: 'SessionNotFoundError',
        serializedCookie: clearSessionCookie(),
      })
    }

    const { session, user } = sessionWithUser

    const encoder = new TextEncoder()
    const expectedTokenHash = hashToken(rawToken)
    const isValid = constantTimeEqual(
      encoder.encode(expectedTokenHash),
      encoder.encode(session.tokenHash),
    )

    if (!isValid) {
      return err({
        type: 'SessionInvalidError',
        serializedCookie: clearSessionCookie(),
      })
    }

    const daysLeft = differenceInDays(session.expiresAt, now())

    if (daysLeft <= 0) {
      return err({
        type: 'SessionExpiredError',
        serializedCookie: clearSessionCookie(),
      })
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
                event: 'session.extend.background_failed',
                session_id: session.id,
                error_type: res.error.type,
                err: res.error.error,
              },
              'Database rejected session extension',
            )
          }
        })
        .catch((error: unknown) => {
          logger.error(
            {
              event: 'session.extend.background_crash',
              session_id: session.id,
              err: error,
            },
            'Critical error during background session extension',
          )
        })

      const newCookieValue = serializeSessionCookie({
        cookieValue,
        expiresAt: extendedExpiresAt,
      })

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
