import { createMiddleware } from '@tanstack/react-start'

import { db, dbPool } from '#/server/neon.server'

export const dbMiddleware = createMiddleware().server(({ next }) =>
  next({ context: { db, dbPool } }),
)
