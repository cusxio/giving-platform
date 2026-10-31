import { and, desc, eq, gte, sql } from 'drizzle-orm'

import { clientTz } from '#/core/date'
import { defineQuery, rows } from '#/server/db.server'
import type { User } from '#/server/schema.server'
import { savedPaymentMethods } from '#/server/schema.server'

/** The user's saved cards that have not expired yet, most recently used first. */
export const unexpiredSavedCards = defineQuery(
  'payments.unexpiredSavedCards',
  (db, userId: User['id']) => {
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
  },
  rows,
)
