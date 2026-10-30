import { eq } from 'drizzle-orm'

import type { DB, DBTransaction } from '#/server/neon.server'
import type { UserSettings } from '#/server/schema.server'
import { userSettings } from '#/server/schema.server'

export class UserSettingsRepository {
  readonly #db: DB
  constructor(db: DB) {
    this.#db = db
  }

  findByUserIdQuery(userId: UserSettings['userId'], db: DB | DBTransaction = this.#db) {
    return db.select().from(userSettings).where(eq(userSettings.userId, userId))
  }
}
