import { and, eq, lte, sql } from 'drizzle-orm'

import { addSeconds } from '#/core/date'
import { defineQuery, firstOrNull, nothing } from '#/server/db.server'
import type { RateLimitAttempt } from '#/server/schema.server'
import { rateLimitAttempts } from '#/server/schema.server'

type Action = RateLimitAttempt['action']

/** Atomically counts one attempt, starting a new window when the current one has expired. */
export const recordAttempt = defineQuery(
  'auth.recordAttempt',
  (db, identifier: string, action: Action, windowSeconds: number, currentTime: Date) => {
    const windowStart = addSeconds(currentTime, -windowSeconds)

    return db
      .insert(rateLimitAttempts)
      .values({
        action,
        attemptCount: 1,
        identifier,
        lastAttemptAt: currentTime,
        windowStartedAt: currentTime,
      })
      .onConflictDoUpdate({
        set: {
          // Reset count to 1 if window expired, otherwise increment
          attemptCount: sql`
                CASE
                  WHEN ${rateLimitAttempts.windowStartedAt} <= ${windowStart} THEN 1
                  ELSE ${rateLimitAttempts.attemptCount} + 1
                END
              `,
          // Reset window start if expired, otherwise keep existing
          windowStartedAt: sql`
                CASE
                  WHEN ${rateLimitAttempts.windowStartedAt} <= ${windowStart} THEN ${currentTime}
                  ELSE ${rateLimitAttempts.windowStartedAt}
                END
              `,
          lastAttemptAt: sql`${currentTime}`,
        },
        target: [rateLimitAttempts.identifier, rateLimitAttempts.action],
      })
      .returning()
  },
  firstOrNull,
)

/**
 * Removes the rows whose window started at or before `windowStart` and answers how many. Such a
 * row counts for nothing: `recordAttempt` would start it over, as its CASE does.
 */
export const deleteStaleAttempts = defineQuery(
  'auth.deleteStaleAttempts',
  (db, windowStart: Date) =>
    db
      .delete(rateLimitAttempts)
      .where(lte(rateLimitAttempts.windowStartedAt, windowStart))
      .returning({ id: rateLimitAttempts.id }),
  (deleted) => deleted.length,
)

export const resetAttempts = defineQuery(
  'auth.resetAttempts',
  (db, identifier: string, action: Action) =>
    db
      .delete(rateLimitAttempts)
      .where(
        and(eq(rateLimitAttempts.identifier, identifier), eq(rateLimitAttempts.action, action)),
      ),
  nothing,
)
