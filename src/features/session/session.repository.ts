import { eq } from 'drizzle-orm'

import { createDBError } from '#/core/errors'
import { ok, tryAsync } from '#/core/result'
import type { AnyDBOrTransaction, DB } from '#/db/client'
import type { Session } from '#/db/schema'
import { sessions } from '#/db/schema'

export class SessionRepository {
  #db: DB
  constructor(db: DB) {
    this.#db = db
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

  async findSessionById(sessionId: Session['id']) {
    const result = await tryAsync(
      () => this.#db.select().from(sessions).where(eq(sessions.id, sessionId)),
      createDBError,
    )

    if (!result.ok) return result

    const session = result.value[0]
    return ok(session ?? null)
  }
}
