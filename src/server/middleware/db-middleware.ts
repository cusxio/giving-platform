import { createMiddleware } from '@tanstack/react-start'

import { db, dbPool } from '#/db/client'

export const dbMiddleware = createMiddleware().server(({ next }) =>
  next({ context: { db, dbPool } }),
)
