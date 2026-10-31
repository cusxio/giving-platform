import { and, eq } from 'drizzle-orm'

import { defineQuery, firstOrNull } from '#/server/db.server'
import type { Transaction, User } from '#/server/schema.server'
import { payments, transactions, users } from '#/server/schema.server'

export type TransactionId = Transaction['id']

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

export const findReceipt = defineQuery(
  'payments.findReceipt',
  (db, transactionId: TransactionId) =>
    db
      .select({
        payment: { message: payments.message },
        transaction: { id: transactions.id, status: transactions.status },
        user: { email: users.email, firstName: users.firstName, status: users.status },
      })
      .from(transactions)
      .innerJoin(users, eq(users.id, transactions.userId))
      .leftJoin(payments, eq(payments.transactionId, transactions.id))
      .where(eq(transactions.id, transactionId)),
  firstOrNull,
)
