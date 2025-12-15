import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, gte, sql } from 'drizzle-orm'

import { getTzOffsetModifier } from '#/core/date'
import { savedPaymentMethods } from '#/db/schema'
import { dbMiddleware } from '#/server/middleware'

export const getSavedPaymentMethods = createServerFn()
  .middleware([dbMiddleware])
  .handler(async ({ context }) => {
    const { db, session } = context

    const userId = session?.userId
    if (userId === undefined) {
      return []
    }

    const modifier = getTzOffsetModifier()

    return db
      .select()
      .from(savedPaymentMethods)
      .where(
        and(
          eq(savedPaymentMethods.userId, userId),
          gte(
            savedPaymentMethods.cardExp,
            sql`strftime('%Y%m', 'now', ${modifier})`,
          ),
        ),
      )
      .orderBy(desc(savedPaymentMethods.lastUsedAt))
  })
