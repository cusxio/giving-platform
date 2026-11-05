import { redirect } from '@tanstack/react-router'
import { setResponseHeader } from '@tanstack/react-start/server'

import { addSeconds, differenceInDays, now } from '#/core/date'
import { createDBError, createParseError } from '#/core/errors'
import type { Result } from '#/core/result'
import { err, ok, trySync, tryAsync } from '#/core/result'
import { constantTimeEqual } from '#/server/crypto.server'
import type { QueryResult } from '#/server/db.server'
import type { Deps } from '#/server/deps.server'
import type { RequestContext } from '#/server/request-context.server'

import type { VerificationError } from './auth.errors'
import {
  clearSessionCookie,
  cookieValueSchema,
  SESSION_MAX_AGE_SECONDS,
  serializeSessionCookie,
} from './session-cookie.server'
import type { Session } from './sessions.repository.server'
import {
  deleteSessionById,
  extendSession,
  findSessionByIdWithUser,
} from './sessions.repository.server'

type SessionWithUser = NonNullable<QueryResult<typeof findSessionByIdWithUser>>

interface ResolvedSession {
  serializedCookie: null | string
  session: SessionWithUser['session']
  user: Pick<SessionWithUser['user'], 'id' | 'journey' | 'role'>
}

/** Who the request belongs to, or nulls for an anonymous one. */
export interface SessionCheck {
  readonly session: null | ResolvedSession['session']
  readonly user: null | ResolvedSession['user']
}

type SessionDeps = Pick<Deps, 'db' | 'hashToken' | 'logger'>

/**
 * Checks a `<sessionId>.<rawToken>` cookie against the stored hash. Deletes the session of a
 * user who is no longer active, and extends one within a week of expiry in the background.
 */
export async function resolveSession(
  deps: SessionDeps,
  cookieValue: string,
): Promise<Result<ResolvedSession, VerificationError>> {
  const { logger } = deps
  const parts = cookieValue.split('.')

  const parseResult = trySync(
    () => cookieValueSchema.Parse({ rawToken: parts[1], sessionId: parts[0] }),
    createParseError,
  )

  if (!parseResult.ok) {
    return parseResult
  }

  const { rawToken, sessionId } = parseResult.value
  const sessionWithUserResult = await tryAsync(
    () => deps.db.run(findSessionByIdWithUser(sessionId)),
    createDBError,
  )

  if (!sessionWithUserResult.ok) {
    return sessionWithUserResult
  }

  const sessionWithUser = sessionWithUserResult.value

  if (sessionWithUser === null) {
    return err({ serializedCookie: clearSessionCookie(), type: 'SessionNotFoundError' })
  }

  const { session, user } = sessionWithUser

  const isValid = constantTimeEqual(deps.hashToken(rawToken), session.tokenHash)

  if (!isValid) {
    return err({ serializedCookie: clearSessionCookie(), type: 'SessionInvalidError' })
  }

  if (user.status !== 'active') {
    const deleteResult = await tryAsync(
      () => deps.db.run(deleteSessionById(session.id)),
      createDBError,
    )

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

    tryAsync(() => deps.db.run(extendSession(session.id, extendedExpiresAt)), createDBError)
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

  return ok({ serializedCookie: null, session, user })
}

/** Resolves the request's session cookie, and sets, refreshes or clears it on the response. */
export async function verifySessionCookie(
  deps: SessionDeps,
  cookieValue: string,
): Promise<SessionCheck> {
  const { logger } = deps
  const verifyResult = await resolveSession(deps, cookieValue)

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

    return { session: null, user: null }
  }

  const { serializedCookie, session, user } = verifyResult.value

  if (serializedCookie !== null) {
    setResponseHeader('Set-Cookie', serializedCookie)
  }

  return { session, user }
}

/** Deletes the session row. A failure is only logged, so logout still clears the cookie. */
export async function endSession(
  deps: Pick<Deps, 'db' | 'logger'>,
  sessionId: Session['id'],
): Promise<void> {
  const { logger } = deps

  logger.info({ event: 'auth.logout.processing', session_id: sessionId }, 'Processing user logout')

  const result = await tryAsync(() => deps.db.run(deleteSessionById(sessionId)), createDBError)

  if (!result.ok) {
    logger.error(
      { err: result.error.error, error_type: result.error.type, event: 'auth.logout.failed' },
      'Failed to delete session from DB',
    )
  }
}

export async function logoutProcedure(
  context: Pick<RequestContext, 'deps' | 'session'>,
): Promise<never> {
  if (context.session) {
    await endSession(context.deps, context.session.id)
  }

  setResponseHeader('Set-Cookie', clearSessionCookie())

  throw redirect({ replace: true, to: '/auth/login' })
}
