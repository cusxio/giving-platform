import { and, desc, eq, gt, isNull } from 'drizzle-orm'

import { addMinutes, now } from '#/core/date'
import { createDBError } from '#/core/errors'
import { ok, tryAsync } from '#/core/result'
import type { DB, DBTransaction } from '#/db/client'
import type { Token, TokenInsert, User } from '#/db/schema'
import { tokens } from '#/db/schema'

export class TokenRepository {
  #db: DB

  constructor(db: DB) {
    this.#db = db
  }

  async createToken(
    userId: TokenInsert['userId'],
    tokenHash: TokenInsert['tokenHash'],
    db: DB | DBTransaction = this.#db,
  ) {
    const tokenRes = await tryAsync(
      () =>
        db
          .insert(tokens)
          .values({ expiresAt: addMinutes(now(), 5), tokenHash, userId }),
      createDBError,
    )

    if (!tokenRes.ok) return tokenRes

    return ok()
  }

  async findToken(userId: User['id']) {
    const result = await tryAsync(
      () =>
        this.#db
          .select()
          .from(tokens)
          .where(
            and(
              eq(tokens.userId, userId),
              gt(tokens.expiresAt, now()),
              isNull(tokens.usedAt),
            ),
          )
          .orderBy(desc(tokens.createdAt))
          .limit(1),
      createDBError,
    )

    if (!result.ok) return result

    const token = result.value[0]
    return ok(token ?? null)
  }

  async markTokenAsUsed(
    tokenHash: Token['tokenHash'],
    db: DB | DBTransaction = this.#db,
  ) {
    const result = await tryAsync(
      () =>
        db
          .update(tokens)
          .set({ usedAt: now() })
          .where(eq(tokens.tokenHash, tokenHash)),
      createDBError,
    )
    if (!result.ok) return result

    return ok()
  }
}
