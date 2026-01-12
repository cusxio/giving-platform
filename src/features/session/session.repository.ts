import { eq } from 'drizzle-orm'

import { createDBError } from '#/core/errors'
import { err, ok, tryAsync } from '#/core/result'
import type { AnyDBOrTransaction, DB } from '#/db/client'
import { DBEmptyReturnError } from '#/db/errors'
import type { Session } from '#/db/schema'
import { sessions, users } from '#/db/schema'

export class SessionRepository {
  #db: DB
  constructor(db: DB) {
    this.#db = db
  }

  async createSession(
    input: Pick<Session, 'expiresAt' | 'tokenHash' | 'userId'>,
  ) {
    const result = await tryAsync(
      () => this.#db.insert(sessions).values(input).returning(),
      createDBError,
    )

    if (!result.ok) return result

    const session = result.value[0]
    if (!session) {
      return err({
        type: 'DBEmptyReturnError' as const,
        error: new DBEmptyReturnError(),
      })
    }

    return ok(session)
  }

  createSessionQuery(
    input: Pick<Session, 'expiresAt' | 'tokenHash' | 'userId'>,
    db: AnyDBOrTransaction = this.#db,
  ) {
    return db.insert(sessions).values(input).returning()
  }

  async deleteSessionById(sessionId: Session['id']) {
    const result = await tryAsync(
      () => this.#db.delete(sessions).where(eq(sessions.id, sessionId)),
      createDBError,
    )

    if (!result.ok) return result

    return ok()
  }

  async extendSession(
    sessionId: Session['id'],
    expiresAt: Session['expiresAt'],
  ) {
    const result = await tryAsync(
      () =>
        this.#db
          .update(sessions)
          .set({ expiresAt })
          .where(eq(sessions.id, sessionId))
          .returning(),
      createDBError,
    )

    if (!result.ok) return result

    const session = result.value[0]
    return ok(session ?? null)
  }

  async findSessionByIdWithUser(sessionId: Session['id']) {
    const result = await tryAsync(
      () =>
        this.#db
          .select({
            session: {
              id: sessions.id,
              tokenHash: sessions.tokenHash,
              expiresAt: sessions.expiresAt,
            },
            user: { id: users.id, role: users.role, journey: users.journey },
          })
          .from(sessions)
          .innerJoin(users, eq(sessions.userId, users.id))
          .where(eq(sessions.id, sessionId)),
      createDBError,
    )

    if (!result.ok) return result

    const sessionWithUser = result.value[0]
    return ok(sessionWithUser ?? null)
  }
}
