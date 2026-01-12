import { and, eq, gt, sql } from 'drizzle-orm'

import { addSeconds, now } from '#/core/date'
import { createDBError } from '#/core/errors'
import { ok, tryAsync } from '#/core/result'
import type { DB } from '#/db/client'
import type { RateLimitAttempt } from '#/db/schema'
import { rateLimitAttempts } from '#/db/schema'

type Action = RateLimitAttempt['action']

export class RateLimitRepository {
  #db: DB

  constructor(db: DB) {
    this.#db = db
  }

  /**
   * Atomically checks rate limit and increments attempt count.
   */
  async checkAndIncrement(
    identifier: string,
    action: Action,
    windowSeconds: number,
  ) {
    const currentTime = now()
    const windowStart = addSeconds(currentTime, -windowSeconds)

    const result = await tryAsync(
      () =>
        this.#db
          .insert(rateLimitAttempts)
          .values({
            identifier,
            action,
            attemptCount: 1,
            windowStartedAt: currentTime,
            lastAttemptAt: currentTime,
          })
          .onConflictDoUpdate({
            target: [rateLimitAttempts.identifier, rateLimitAttempts.action],
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
          })
          .returning(),
      createDBError,
    )

    if (!result.ok) return result

    const record = result.value[0]
    return ok({
      attemptCount: record?.attemptCount ?? 1,
      windowStartedAt: record?.windowStartedAt ?? currentTime,
    })
  }

  /**
   * Get current attempt count without incrementing.
   */
  async getAttemptCount(
    identifier: string,
    action: Action,
    windowSeconds: number,
  ) {
    const windowStart = addSeconds(now(), -windowSeconds)

    const result = await tryAsync(
      () =>
        this.#db
          .select({ attemptCount: rateLimitAttempts.attemptCount })
          .from(rateLimitAttempts)
          .where(
            and(
              eq(rateLimitAttempts.identifier, identifier),
              eq(rateLimitAttempts.action, action),
              gt(rateLimitAttempts.windowStartedAt, windowStart),
            ),
          )
          .limit(1),
      createDBError,
    )

    if (!result.ok) return result

    return ok(result.value[0]?.attemptCount ?? 0)
  }

  /**
   * Reset rate limit for an identifier (e.g., after successful verification).
   */
  async reset(identifier: string, action: Action) {
    const result = await tryAsync(
      () =>
        this.#db
          .delete(rateLimitAttempts)
          .where(
            and(
              eq(rateLimitAttempts.identifier, identifier),
              eq(rateLimitAttempts.action, action),
            ),
          ),
      createDBError,
    )

    return result.ok ? ok() : result
  }
}
