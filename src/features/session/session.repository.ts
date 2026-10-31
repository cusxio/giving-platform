import { eq } from 'drizzle-orm'

import { createDBError } from '#/core/errors'
import { ok, tryAsync } from '#/core/result'
import type { DB } from '#/server/neon.server'
import type { Session } from '#/server/schema.server'
import { sessions, users } from '#/server/schema.server'

export class SessionRepository {
  readonly #db: DB
  constructor(db: DB) {
    this.#db = db
  }

  async deleteSessionById(sessionId: Session['id']) {
    const result = await tryAsync(
      () => this.#db.delete(sessions).where(eq(sessions.id, sessionId)),
      createDBError,
    )

    if (!result.ok) {
      return result
    }

    return ok()
  }

  async extendSession(sessionId: Session['id'], expiresAt: Session['expiresAt']) {
    const result = await tryAsync(
      () =>
        this.#db.update(sessions).set({ expiresAt }).where(eq(sessions.id, sessionId)).returning(),
      createDBError,
    )

    if (!result.ok) {
      return result
    }

    const [session] = result.value
    return ok(session ?? null)
  }

  async findSessionByIdWithUser(sessionId: Session['id']) {
    const result = await tryAsync(
      () =>
        this.#db
          .select({
            session: {
              expiresAt: sessions.expiresAt,
              id: sessions.id,
              tokenHash: sessions.tokenHash,
            },
            user: { id: users.id, journey: users.journey, role: users.role, status: users.status },
          })
          .from(sessions)
          .innerJoin(users, eq(sessions.userId, users.id))
          .where(eq(sessions.id, sessionId)),
      createDBError,
    )

    if (!result.ok) {
      return result
    }

    const [sessionWithUser] = result.value
    return ok(sessionWithUser ?? null)
  }
}
