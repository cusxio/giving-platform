import { eq } from 'drizzle-orm'

import { defineQuery, firstOrNull, nothing } from '#/server/db.server'
import type { Session } from '#/server/schema.server'
import { sessions } from '#/server/schema.server'

export type { Session } from '#/server/schema.server'

export const createSession = defineQuery(
  'auth.createSession',
  (db, input: Pick<Session, 'expiresAt' | 'tokenHash' | 'userId'>) =>
    db.insert(sessions).values(input).returning(),
  firstOrNull,
)

export const deleteSessionById = defineQuery(
  'auth.deleteSessionById',
  (db, sessionId: Session['id']) => db.delete(sessions).where(eq(sessions.id, sessionId)),
  nothing,
)
