import { and, eq, gt, isNotNull, isNull, lte, or, sql } from 'drizzle-orm'

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

/**
 * Stores a code's hash. The hash is unique per user, so a repeated six digits conflict with the
 * row that holds them. Run after `deleteDeadTokensOf` in one batch, that row is live, and so it is
 * this very code: it keeps its id, and with it its check count, and takes the new expiry and mode.
 */
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
      .values({ expiresAt: addMinutes(now(), CODE_LIFETIME_MINUTES), mode, tokenHash, userId })
      .onConflictDoUpdate({
        set: { expiresAt: sql`excluded.expires_at`, mode: sql`excluded.mode` },
        target: [tokens.tokenHash, tokens.userId],
      }),
  nothing,
)

/** A code nobody can enter any more: claimed, or past its expiry. */
const dead = () => or(isNotNull(tokens.usedAt), lte(tokens.expiresAt, now()))

/** Removes the user's dead codes, so a new code can only conflict with a live one. */
export const deleteDeadTokensOf = defineQuery(
  'auth.deleteDeadTokensOf',
  (db, userId: Token['userId']) => db.delete(tokens).where(and(eq(tokens.userId, userId), dead())),
  nothing,
)

/** Removes every user's dead codes and answers how many. */
export const deleteDeadTokens = defineQuery(
  'auth.deleteDeadTokens',
  (db) => db.delete(tokens).where(dead()).returning({ id: tokens.id }),
  (deleted) => deleted.length,
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
