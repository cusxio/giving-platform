import { redirect } from '@tanstack/react-router'
import { setResponseHeader } from '@tanstack/react-start/server'
import { Result } from 'better-result'

import { addSeconds, differenceInDays, now } from '#/core/date'
import { createDBError } from '#/core/errors'
import { tryAsync } from '#/core/result'
import { constantTimeEqual } from '#/server/crypto.server'
import type { QueryResult } from '#/server/db.server'
import type { Deps } from '#/server/deps.server'
import { InfraError } from '#/server/infra-error'
import { legacyDb } from '#/server/legacy-db.server'
import { logInfraEvent } from '#/server/procedure.server'
import type { RequestContext } from '#/server/request-context.server'

import type { SessionRejection } from './auth.errors'
import {
  ParseError,
  SessionExpiredError,
  SessionInvalidError,
  SessionNotFoundError,
  SessionUserInactiveError,
} from './auth.errors'
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
  /** The cookie to send back: a refreshed one when the session was extended. */
  serializedCookie: null | string
  session: SessionWithUser['session']
  user: Pick<SessionWithUser['user'], 'id' | 'journey' | 'role'>
}

/** Who the request belongs to. An anonymous request has neither, so a null test on one narrows both. */
export type SessionCheck =
  | { readonly session: null; readonly user: null }
  | { readonly session: ResolvedSession['session']; readonly user: ResolvedSession['user'] }

type SessionDeps = Pick<Deps, 'db' | 'hashToken' | 'logger'>

/** Extends the session in the database. A failure is only logged: the cookie is refreshed anyway. */
async function extendInBackground(
  deps: SessionDeps,
  { session, user }: Omit<ResolvedSession, 'serializedCookie'>,
): Promise<void> {
  const { logger } = deps
  const extended = await deps.db.run(extendSession(session.id, session.expiresAt))
  if (extended.isErr()) {
    logInfraEvent(logger, extended.error, {
      event: 'session.extend.background_failed',
      fields: { session_id: session.id },
      level: 'warn',
      msg: 'Database rejected session extension',
    })
    return
  }
  logger.info(
    { event: 'session.extend.background_success', session_id: session.id, user_id: user.id },
    'Session extended successfully in background',
  )
}

/**
 * Checks a `<sessionId>.<rawToken>` cookie against the stored hash. Deletes the session of a
 * user who is no longer active, and extends one within a week of expiry in the background.
 */
async function resolveSession(
  deps: SessionDeps,
  cookieValue: string,
): Promise<Result<ResolvedSession, InfraError | SessionRejection>> {
  const { logger } = deps
  const [sessionId, rawToken] = cookieValue.split('.')

  const parsed = Result.try({
    catch: (cause) => new ParseError({ cause }),
    try: () => cookieValueSchema.Parse({ rawToken, sessionId }),
  })
  if (parsed.isErr()) {
    return parsed
  }

  const found = await deps.db.run(findSessionByIdWithUser(parsed.value.sessionId))
  if (found.isErr()) {
    return found
  }
  if (found.value === null) {
    return Result.err(new SessionNotFoundError())
  }

  const { session, user } = found.value

  if (!constantTimeEqual(deps.hashToken(parsed.value.rawToken), session.tokenHash)) {
    return Result.err(new SessionInvalidError())
  }

  if (user.status !== 'active') {
    const deleted = await deps.db.run(deleteSessionById(session.id))
    if (deleted.isErr()) {
      logInfraEvent(logger, deleted.error, {
        event: 'session.verify.inactive_delete_failed',
        fields: { session_id: session.id },
        level: 'warn',
        msg: 'Failed to delete session of inactive user',
      })
    }
    return Result.err(new SessionUserInactiveError())
  }

  const daysLeft = differenceInDays(session.expiresAt, now())

  if (daysLeft <= 0) {
    return Result.err(new SessionExpiredError())
  }

  if (daysLeft > 7) {
    return Result.ok({ serializedCookie: null, session, user })
  }

  const extended = {
    session: { ...session, expiresAt: addSeconds(now(), SESSION_MAX_AGE_SECONDS) },
    user,
  }

  extendInBackground(deps, extended).catch((error: unknown) => {
    logger.error(
      { err: error, event: 'session.extend.background_crash', session_id: session.id },
      'Critical error during background session extension',
    )
  })

  return Result.ok({
    ...extended,
    serializedCookie: serializeSessionCookie({
      cookieValue,
      expiresAt: extended.session.expiresAt,
    }),
  })
}

/** Resolves the request's session cookie, and sets, refreshes or clears it on the response. */
export async function verifySessionCookie(
  deps: SessionDeps,
  cookieValue: string,
): Promise<SessionCheck> {
  const { logger } = deps
  const resolved = await resolveSession(deps, cookieValue)

  if (resolved.isOk()) {
    const { serializedCookie, session, user } = resolved.value
    if (serializedCookie !== null) {
      setResponseHeader('Set-Cookie', serializedCookie)
    }
    return { session, user }
  }

  const { error } = resolved
  if (InfraError.is(error)) {
    logInfraEvent(logger, error, {
      event: 'session.verify.db_error',
      level: 'error',
      msg: 'Database error during session verification',
    })
  } else if (ParseError.is(error)) {
    logger.warn(
      { err: error.cause, error_type: error._tag, event: 'session.verify.validation_failed' },
      'Cookie format is invalid',
    )
  } else {
    logger.info(
      { event: 'session.verify.invalid', reason: error._tag },
      'Session is invalid or expired',
    )
  }
  setResponseHeader('Set-Cookie', clearSessionCookie())

  return { session: null, user: null }
}

/** Deletes the session row. A failure is only logged, so logout still clears the cookie. */
export async function endSession(
  deps: Pick<Deps, 'db' | 'logger'>,
  sessionId: Session['id'],
): Promise<void> {
  const { logger } = deps

  logger.info({ event: 'auth.logout.processing', session_id: sessionId }, 'Processing user logout')

  const result = await tryAsync(
    () => legacyDb(deps.db).run(deleteSessionById(sessionId)),
    createDBError,
  )

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
