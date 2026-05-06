import { redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'

import { authServiceMiddleware } from '#/server/middleware'

import { clearSessionCookie } from '../session/utils'

export const logout = createServerFn({ method: 'POST' })
  .middleware([authServiceMiddleware])
  .handler(async ({ context }) => {
    const { authService, session, logger } = context

    if (session) {
      logger.info(
        { event: 'auth.logout.processing', session_id: session.id },
        'Processing user logout',
      )
      const result = await authService.logout(session.id)

      if (!result.ok) {
        logger.error(
          { err: result.error.error, error_type: result.error.type, event: 'auth.logout.failed' },
          'Failed to delete session from DB',
        )
      }
    }

    setResponseHeader('Set-Cookie', clearSessionCookie())

    throw redirect({ replace: true, to: '/auth/login' })
  })
