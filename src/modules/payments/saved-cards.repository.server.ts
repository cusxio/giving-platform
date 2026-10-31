import { and, desc, eq, gte, sql } from 'drizzle-orm'

import { clientTz } from '#/core/date'
import { defineQuery, firstOrNull, rows } from '#/server/db.server'
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

/** The card, if the user saved it. Charging a token checks ownership with this first. */
export const findSavedCard = defineQuery(
  'payments.findSavedCard',
  (db, userId: User['id'], token: string) =>
    db
      .select({ id: savedPaymentMethods.id })
      .from(savedPaymentMethods)
      .where(and(eq(savedPaymentMethods.userId, userId), eq(savedPaymentMethods.token, token)))
      .limit(1),
  firstOrNull,
)
