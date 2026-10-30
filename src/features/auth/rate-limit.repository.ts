import { and, eq, sql } from 'drizzle-orm'

import { addSeconds, now } from '#/core/date'
import { createDBError } from '#/core/errors'
import { ok, tryAsync } from '#/core/result'
import type { DB } from '#/server/neon.server'
import type { RateLimitAttempt } from '#/server/schema.server'
import { rateLimitAttempts } from '#/server/schema.server'

type Action = RateLimitAttempt['action']

export class RateLimitRepository {
  readonly #db: DB

  constructor(db: DB) {
    this.#db = db
  }

  /**
   * Atomically checks rate limit and increments attempt count.
   */
  async checkAndIncrement(identifier: string, action: Action, windowSeconds: number) {
    const currentTime = now()
    const windowStart = addSeconds(currentTime, -windowSeconds)

    const result = await tryAsync(
      () =>
        this.#db
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
          .returning(),
      createDBError,
    )

    if (!result.ok) {
      return result
    }

    const [record] = result.value
    return ok({
      attemptCount: record?.attemptCount ?? 1,
      windowStartedAt: record?.windowStartedAt ?? currentTime,
    })
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
            and(eq(rateLimitAttempts.identifier, identifier), eq(rateLimitAttempts.action, action)),
          ),
      createDBError,
    )

    return result.ok ? ok() : result
  }
}
