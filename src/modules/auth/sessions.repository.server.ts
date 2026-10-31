import { eq } from 'drizzle-orm'

import { defineQuery, firstOrNull, nothing } from '#/server/db.server'
import type { Session } from '#/server/schema.server'
import { sessions, users } from '#/server/schema.server'

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

export const extendSession = defineQuery(
  'auth.extendSession',
  (db, sessionId: Session['id'], expiresAt: Session['expiresAt']) =>
    db.update(sessions).set({ expiresAt }).where(eq(sessions.id, sessionId)).returning(),
  firstOrNull,
)

export const findSessionByIdWithUser = defineQuery(
  'auth.findSessionByIdWithUser',
  (db, sessionId: Session['id']) =>
    db
      .select({
        session: { expiresAt: sessions.expiresAt, id: sessions.id, tokenHash: sessions.tokenHash },
        user: { id: users.id, journey: users.journey, role: users.role, status: users.status },
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.id, sessionId)),
  firstOrNull,
)
