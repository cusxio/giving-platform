import { createMiddleware } from '@tanstack/react-start'
import { getCookie, setResponseHeader } from '@tanstack/react-start/server'
import type { Logger } from 'pino'

import { SESSION_COOKIE_NAME } from '#/features/session/constants'
import { SessionRepository } from '#/features/session/session.repository'
import { SessionService } from '#/features/session/session.service'
import { clearSessionCookie } from '#/features/session/utils'
import type { Deps } from '#/server/deps.server'
import { createDeps } from '#/server/deps.server'
import { logger } from '#/server/logger.server'
import { db } from '#/server/neon.server'
import type { Session, User } from '#/server/schema.server'

/** What every server function and server route finds on `context`. */
export interface RequestContext {
  readonly deps: Deps
  /** The same logger as `deps.logger`, kept until every caller reads it from `deps`. */
  readonly logger: Logger
  readonly session: null | Pick<Session, 'expiresAt' | 'id' | 'tokenHash'>
  readonly user: null | Pick<User, 'id' | 'journey' | 'role'>
}

type SessionCheck = Pick<RequestContext, 'session' | 'user'>

const ANONYMOUS: SessionCheck = { session: null, user: null }

/** Verifies the session cookie and sets or clears it on the response. */
async function checkSession(): Promise<SessionCheck> {
  const sessionService = new SessionService(new SessionRepository(db))

  const sessionId = getCookie(SESSION_COOKIE_NAME)

  // We don't create sessions for unauthenticated users
  if (sessionId === undefined) {
    return ANONYMOUS
  }

  const verifyResult = await sessionService.verifyCookieSession(sessionId)

  if (!verifyResult.ok) {
    const { type } = verifyResult.error

    switch (type) {
      case 'DBEmptyReturnError':
      case 'DBQueryError': {
        logger.error(
          {
            err: verifyResult.error.error,
            error_type: verifyResult.error.type,
            event: 'session.verify.db_error',
          },
          'Database error during session verification',
        )
        setResponseHeader('Set-Cookie', clearSessionCookie())
        break
      }
      case 'ParseError': {
        logger.warn(
          {
            err: verifyResult.error.error,
            error_type: verifyResult.error.type,
            event: 'session.verify.validation_failed',
          },
          'Cookie format is invalid',
        )
        setResponseHeader('Set-Cookie', clearSessionCookie())
        break
      }
      case 'SessionExpiredError':
      case 'SessionInvalidError':
      case 'SessionNotFoundError':
      case 'SessionUserInactiveError': {
        logger.info(
          { event: 'session.verify.invalid', reason: type },
          'Session is invalid or expired',
        )
        setResponseHeader('Set-Cookie', verifyResult.error.serializedCookie)
        break
      }
    }

    return ANONYMOUS
  }

  const { serializedCookie, session, user } = verifyResult.value

  if (serializedCookie !== null) {
    setResponseHeader('Set-Cookie', serializedCookie)
  }

  return { session, user }
}

/** The one global request middleware after csrf and maintenance. */
export const requestContext = createMiddleware().server<RequestContext>(async ({ next }) => {
  const { session, user } = await checkSession()
  const deps = createDeps(logger.child({ user_id: user?.id }))
  return next({ context: { deps, logger: deps.logger, session, user } })
})
