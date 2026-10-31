import { eq } from 'drizzle-orm'

import { defineQuery, nothing } from '#/server/db.server'
import type { Session } from '#/server/schema.server'
import { sessions } from '#/server/schema.server'

export type { Session } from '#/server/schema.server'

export const deleteSessionById = defineQuery(
  'auth.deleteSessionById',
  (db, sessionId: Session['id']) => db.delete(sessions).where(eq(sessions.id, sessionId)),
  nothing,
)
