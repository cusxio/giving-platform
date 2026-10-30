import { and, eq } from 'drizzle-orm'

import { createDBError } from '#/core/errors'
import { ok, tryAsync } from '#/core/result'
import type { DB, DBTransaction } from '#/db/client'
import type { SavedPaymentMethod } from '#/db/schema'
import { savedPaymentMethods } from '#/db/schema'

export class SavedPaymentMethodRepository {
  readonly #db: DB
  constructor(db: DB) {
    this.#db = db
  }

  async findByUserIdAndToken(
    userId: SavedPaymentMethod['userId'],
    token: SavedPaymentMethod['token'],
    db: DB | DBTransaction = this.#db,
  ) {
    const result = await tryAsync(
      () =>
        db
          .select({ id: savedPaymentMethods.id })
          .from(savedPaymentMethods)
          .where(and(eq(savedPaymentMethods.userId, userId), eq(savedPaymentMethods.token, token)))
          .limit(1),
      createDBError,
    )

    if (!result.ok) {
      return result
    }

    const [savedPaymentMethod] = result.value
    return ok(savedPaymentMethod ?? null)
  }
}
