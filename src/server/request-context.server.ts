import { createMiddleware } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'

import type { SessionCheck } from '#/modules/auth/server'
import { SESSION_COOKIE_NAME, verifySessionCookie } from '#/modules/auth/server'
import type { Deps } from '#/server/deps.server'
import { createDeps } from '#/server/deps.server'
import { logger } from '#/server/logger.server'

/** What every server function and server route finds on `context`. */
export interface RequestContext {
  readonly deps: Deps
  readonly session: SessionCheck['session']
  readonly user: SessionCheck['user']
}

const ANONYMOUS: SessionCheck = { session: null, user: null }

/** The one global request middleware after csrf and maintenance. */
export const requestContext = createMiddleware().server<RequestContext>(async ({ next }) => {
  const base = createDeps(logger)
  const cookie = getCookie(SESSION_COOKIE_NAME)
  const { session, user } =
    cookie === undefined ? ANONYMOUS : await verifySessionCookie(base, cookie)
  const deps: Deps = { ...base, logger: logger.child({ user_id: user?.id }) }
  return next({ context: { deps, session, user } })
})
