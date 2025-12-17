import { eq } from 'drizzle-orm'

import { createDBError } from '#/core/errors'
import { ok, tryAsync } from '#/core/result'
import type { DB, DBTransaction } from '#/db/client'
import type { UserSettings } from '#/db/schema'
import { userSettings } from '#/db/schema'

export class UserSettingsRepository {
  #db: DB
  constructor(db: DB) {
    this.#db = db
  }

  async findByUserId(
    userId: UserSettings['userId'],
    db: DB | DBTransaction = this.#db,
  ) {
    const result = await tryAsync(
      () => this.findByUserIdQuery(userId, db),
      createDBError,
    )

    if (!result.ok) return result

    const settings = result.value[0]
    return ok(settings ?? null)
  }

  findByUserIdQuery(
    userId: UserSettings['userId'],
    db: DB | DBTransaction = this.#db,
  ) {
    return db.select().from(userSettings).where(eq(userSettings.userId, userId))
  }
}
