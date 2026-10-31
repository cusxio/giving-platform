import { redirect } from '@tanstack/react-router'
import { setResponseHeader } from '@tanstack/react-start/server'

import { createDBError } from '#/core/errors'
import { tryAsync } from '#/core/result'
import { clearSessionCookie } from '#/features/session/utils'
import type { Deps } from '#/server/deps.server'
import type { RequestContext } from '#/server/request-context.server'

import type { Session } from './sessions.repository.server'
import { deleteSessionById } from './sessions.repository.server'

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
