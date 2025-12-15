import { createMiddleware } from '@tanstack/react-start'
import { getCookie, setResponseHeader } from '@tanstack/react-start/server'

import { logger } from '#/core/logger'
import { db } from '#/db/client'
import type { Session } from '#/db/schema'
import { SESSION_COOKIE_NAME } from '#/features/session/constants'
import { SessionRepository } from '#/features/session/session.repository'
import { SessionService } from '#/features/session/session.service'
import { clearSessionCookie } from '#/features/session/utils'

export const sessionMiddleware = createMiddleware().server<{
  session: null | Session
}>(async ({ next }) => {
  const sessionRepository = new SessionRepository(db)
  const sessionService = new SessionService(sessionRepository)

  const sessionId = getCookie(SESSION_COOKIE_NAME)

  // We don't create sessions for unauthenticated users
  if (sessionId === undefined) {
    return next({ context: { session: null } })
  }

  const verifyResult = await sessionService.verifyCookieSession(sessionId)

  if (!verifyResult.ok) {
    const { type } = verifyResult.error

    switch (type) {
      case 'DBEmptyReturnError':
      case 'DBQueryError': {
        logger.error(
          {
            event: 'session.verify.db_error',
            err: verifyResult.error.error,
            error_type: verifyResult.error.type,
          },
          'Database error during session verification',
        )
        setResponseHeader('Set-Cookie', clearSessionCookie())
        break
      }
      case 'ParseError': {
        logger.warn(
          {
            event: 'session.verify.validation_failed',
            err: verifyResult.error.error,
            error_type: verifyResult.error.type,
          },
          'Cookie format is invalid',
        )
        setResponseHeader('Set-Cookie', clearSessionCookie())
        break
      }
      case 'SessionExpiredError':
      case 'SessionInvalidError':
      case 'SessionNotFoundError': {
        logger.info(
          { event: 'session.verify.invalid', reason: type },
          'Session is invalid or expired',
        )
        setResponseHeader('Set-Cookie', verifyResult.error.serializedCookie)
        break
      }
    }

    return next({ context: { session: null } })
  }

  const { serializedCookie, session } = verifyResult.value

  if (serializedCookie !== null) {
    setResponseHeader('Set-Cookie', serializedCookie)
  }

  return next({ context: { session } })
})
