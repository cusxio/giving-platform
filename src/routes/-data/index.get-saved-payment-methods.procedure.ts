import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, gte, sql } from 'drizzle-orm'

import { clientTz } from '#/core/date'
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

    const currentYearMonth = sql<string>`TO_CHAR(NOW() AT TIME ZONE ${clientTz}, 'YYYYMM')`

    return db
      .select()
      .from(savedPaymentMethods)
      .where(
        and(
          eq(savedPaymentMethods.userId, userId),
          gte(savedPaymentMethods.cardExp, currentYearMonth),
        ),
      )
      .orderBy(desc(savedPaymentMethods.lastUsedAt))
  })
