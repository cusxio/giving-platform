import { createMiddleware } from '@tanstack/react-start'

import { logger } from '#/server/logger.server'

import { sessionMiddleware } from './session-middleware'

export const loggingMiddleware = createMiddleware()
  .middleware([sessionMiddleware])
  .server(({ next, context }) => {
    const childLogger = logger.child({ user_id: context.user?.id })
    return next({ context: { logger: childLogger } })
  })
