import { constantTimeEqual } from '@oslojs/crypto/subtle'

import { addSeconds, differenceInDays, now } from '#/core/date'
import { createParseError } from '#/core/errors'
import { hashToken } from '#/core/hash-token'
import type { Result } from '#/core/result'
import { err, ok, trySync } from '#/core/result'
import { DBEmptyReturnError } from '#/db/errors'
import type { Session } from '#/db/schema'

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
      { serializedCookie: null | string; session: Session },
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
    const sessionResult =
      await this.#sessionRepository.findSessionById(sessionId)

    if (!sessionResult.ok) {
      return sessionResult
    }

    const session = sessionResult.value

    if (session === null) {
      return err({
        type: 'SessionNotFoundError',
        serializedCookie: clearSessionCookie(),
      })
    }

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

      const extendResult = await this.#sessionRepository.extendSession(
        session.id,
        extendedExpiresAt,
      )

      if (!extendResult.ok) {
        return extendResult
      }

      const extendedSession = extendResult.value

      if (extendedSession === null) {
        return err({
          type: 'DBEmptyReturnError',
          error: new DBEmptyReturnError(),
        })
      }

      const newCookieValue = serializeSessionCookie({
        cookieValue,
        expiresAt: extendedExpiresAt,
      })

      return ok({ serializedCookie: newCookieValue, session: extendedSession })
    }

    // Session is valid and doesn't need to be extended
    return ok({ serializedCookie: null, session })
  }
}
