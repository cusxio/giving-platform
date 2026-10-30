import { and, eq } from 'drizzle-orm'

import { defineQuery } from '#/server/db.server'
import type { User } from '#/server/schema.server'
import { transactions } from '#/server/schema.server'

/** Whether the user gave as a guest before signing up. */
export const hasGuestTransaction = defineQuery(
  'payments.hasGuestTransaction',
  (db, userId: User['id']) =>
    db
      .select({ exists: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.createdAs, 'guest')))
      .limit(1),
  (found) => found.length > 0,
)
