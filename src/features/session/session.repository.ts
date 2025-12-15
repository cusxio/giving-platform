import { eq } from 'drizzle-orm'

import { createDBError } from '#/core/errors'
import { ok, tryAsync } from '#/core/result'
import type { DB, DBTransaction } from '#/db/client'
import { sessions } from '#/db/schema'
import type { Session } from '#/db/schema'

export class SessionRepository {
  #db: DB
  constructor(db: DB) {
    this.#db = db
  }

  async createSession(
    input: Pick<Session, 'expiresAt' | 'tokenHash' | 'userId'>,
    db: DB | DBTransaction = this.#db,
  ) {
    const result = await tryAsync(
      () => db.insert(sessions).values(input).returning(),
      createDBError,
    )
    if (!result.ok) return result

    const session = result.value[0]
    return ok(session ?? null)
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
