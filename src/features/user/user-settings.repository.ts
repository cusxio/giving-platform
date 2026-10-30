import { eq } from 'drizzle-orm'

import type { DB, DBTransaction } from '#/db/client'
import type { UserSettings } from '#/db/schema'
import { userSettings } from '#/db/schema'

export class UserSettingsRepository {
  readonly #db: DB
  constructor(db: DB) {
    this.#db = db
  }

  findByUserIdQuery(userId: UserSettings['userId'], db: DB | DBTransaction = this.#db) {
    return db.select().from(userSettings).where(eq(userSettings.userId, userId))
  }
}
