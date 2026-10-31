import type { InferInsertModel } from 'drizzle-orm'
import { and, asc, eq, gt, inArray, lt } from 'drizzle-orm'

import { addDays, addMinutes, now } from '#/core/date'
import { affectedRows, defineQuery, firstOrNull, nothing, rows } from '#/server/db.server'
import type { PaymentInsert, Transaction, User } from '#/server/schema.server'
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

/** The amount of a transaction still awaiting a final status, or undefined once settled. */
export const findPendingAmountInCents = defineQuery(
  'payments.findPendingAmountInCents',
  (db, transactionId: TransactionId) =>
    db
      .select({ amount: transactions.amount })
      .from(transactions)
      .where(and(eq(transactions.id, transactionId), eq(transactions.status, 'pending'))),
  (found) => found[0]?.amount,
)

/** Moves a pending transaction to a final status. Null when it is no longer pending or unknown. */
export const settleTransaction = defineQuery(
  'payments.settleTransaction',
  (db, transactionId: TransactionId, status: Exclude<Transaction['status'], 'pending'>) =>
    db
      .update(transactions)
      .set({ status })
      .where(and(eq(transactions.id, transactionId), eq(transactions.status, 'pending')))
      .returning({ createdAs: transactions.createdAs, userId: transactions.userId }),
  firstOrNull,
)

export const insertPayment = defineQuery(
  'payments.insertPayment',
  (db, payment: PaymentInsert) => db.insert(payments).values(payment),
  nothing,
)

/** Up to 25 pending transactions created between 2 days and 15 minutes ago, oldest first. */
export const pendingTransactionsToReconcile = defineQuery(
  'payments.pendingTransactionsToReconcile',
  (db) =>
    db
      .select({
        amountInCents: transactions.amount,
        createdAt: transactions.createdAt,
        transactionId: transactions.id,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.status, 'pending'),
          lt(transactions.createdAt, addMinutes(now(), -15)),
          gt(transactions.createdAt, addDays(now(), -2)),
        ),
      )
      .orderBy(asc(transactions.createdAt))
      .limit(25),
  rows,
)

/** Marks the transactions failed if they are still pending. Yields how many it changed. */
export const markPendingTransactionsFailed = defineQuery(
  'payments.markPendingTransactionsFailed',
  (db, transactionIds: TransactionId[]) =>
    db
      .update(transactions)
      .set({ status: 'failed' })
      .where(and(inArray(transactions.id, transactionIds), eq(transactions.status, 'pending'))),
  affectedRows,
)
