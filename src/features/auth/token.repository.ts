import { and, desc, eq, gt, isNull } from 'drizzle-orm'

import { addMinutes, now } from '#/core/date'
import { createDBError } from '#/core/errors'
import { ok, tryAsync } from '#/core/result'
import type { AnyDBOrTransaction, DB, DBTransaction } from '#/db/client'
import type { Token, TokenInsert, User } from '#/db/schema'
import { tokens } from '#/db/schema'

export class TokenRepository {
  #db: DB

  constructor(db: DB) {
    this.#db = db
  }

  /**
   * Atomically claim a token if it hasn't been used yet.
   * Returns true if successfully claimed, false if already used (lost race).
   */
  async claimTokenIfUnused(
    tokenId: Token['id'],
    tokenHash: Token['tokenHash'],
  ) {
    const result = await tryAsync(
      () =>
        this.#db
          .update(tokens)
          .set({ usedAt: now() })
          .where(
            and(
              eq(tokens.id, tokenId),
              eq(tokens.tokenHash, tokenHash),
              isNull(tokens.usedAt),
              gt(tokens.expiresAt, now()),
            ),
          )
          .returning({ id: tokens.id }),
      createDBError,
    )

    if (!result.ok) return result

    return ok(result.value.length === 1)
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

  markTokenAsUsedQuery(
    tokenHash: Token['tokenHash'],
    db: AnyDBOrTransaction = this.#db,
  ) {
    return db
      .update(tokens)
      .set({ usedAt: now() })
      .where(eq(tokens.tokenHash, tokenHash))
  }
}
