import type { InferInsertModel } from 'drizzle-orm'
import { and, eq, inArray } from 'drizzle-orm'

import { defineQuery, firstOrNull, nothing, rows } from '#/server/db.server'
import type { Transaction, User } from '#/server/schema.server'
import { funds, payments, transactionItems, transactions, users } from '#/server/schema.server'

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

/** Funds by their table name, such as `Offering`. Names with no fund are left out. */
export const findFundsByName = defineQuery(
  'payments.findFundsByName',
  (db, names: string[]) => db.select().from(funds).where(inArray(funds.name, names)),
  rows,
)

export const insertPendingTransaction = defineQuery(
  'payments.insertPendingTransaction',
  (db, input: Pick<Transaction, 'amount' | 'createdAs' | 'userId'>) =>
    db
      .insert(transactions)
      .values({
        amount: input.amount,
        createdAs: input.createdAs,
        status: 'pending',
        userId: input.userId,
      })
      .returning(),
  firstOrNull,
)

export const insertTransactionItems = defineQuery(
  'payments.insertTransactionItems',
  (db, items: InferInsertModel<typeof transactionItems>[]) =>
    db.insert(transactionItems).values(items),
  nothing,
)
