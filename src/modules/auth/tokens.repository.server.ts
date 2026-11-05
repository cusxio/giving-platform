import { and, eq, gt, isNull } from 'drizzle-orm'

import { addMinutes, now } from '#/core/date'
import { defineQuery, nothing, rows } from '#/server/db.server'
import type { Token, TokenInsert } from '#/server/schema.server'
import { tokens } from '#/server/schema.server'

export type { Token } from '#/server/schema.server'

/** True when this call used the token; false when another request already did (lost race). */
export const claimTokenIfUnused = defineQuery(
  'auth.claimTokenIfUnused',
  (db, tokenId: Token['id'], tokenHash: Token['tokenHash']) =>
    db
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
  (claimed) => claimed.length === 1,
)

/** How long a code can be used after it is issued. */
export const CODE_LIFETIME_MINUTES = 5

export const createToken = defineQuery(
  'auth.createToken',
  (
    db,
    userId: TokenInsert['userId'],
    tokenHash: TokenInsert['tokenHash'],
    mode: TokenInsert['mode'],
  ) =>
    db
      .insert(tokens)
      .values({ expiresAt: addMinutes(now(), CODE_LIFETIME_MINUTES), mode, tokenHash, userId }),
  nothing,
)

/** The user's unexpired, unused codes of `mode`: every one the user may still enter. */
export const findLiveTokens = defineQuery(
  'auth.findLiveTokens',
  (db, userId: Token['userId'], mode: Token['mode']) =>
    db
      .select()
      .from(tokens)
      .where(
        and(
          eq(tokens.userId, userId),
          eq(tokens.mode, mode),
          gt(tokens.expiresAt, now()),
          isNull(tokens.usedAt),
        ),
      ),
  rows,
)
