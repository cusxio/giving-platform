import type { InferInsertModel } from 'drizzle-orm'
import { and, asc, count, desc, eq, gt, inArray, lt, lte } from 'drizzle-orm'

import { addDays, addMinutes, now } from '#/core/date'
import { sourcesOf, TRANSACTION_STATUSES } from '#/core/transaction-status'
import { defineQuery, firstOrNull, nothing, rows } from '#/server/db.server'
import type { PaymentInsert, Transaction, User } from '#/server/schema.server'
import { funds, payments, transactionItems, transactions, users } from '#/server/schema.server'
import type { SameLength } from '#/server/sql.server'

import type { TEXT_COLUMN_LENGTHS } from './eghl.outcome'
import type { Transition } from './payment-outcome'
import { RECONCILE_MIN_AGE_MINUTES, RECONCILE_WINDOW_DAYS } from './payment-outcome'

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
      .where(eq(transactions.id, transactionId))
      .orderBy(desc(payments.id))
      .limit(1),
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

class UnknownStatusError extends Error {
  override name = 'UnknownStatusError'
}

const knownStatus = <Row extends { status: string }>(row: Row | null): Row | null => {
  if (row !== null && !(TRANSACTION_STATUSES as readonly string[]).includes(row.status)) {
    throw new UnknownStatusError(
      `transaction status "${row.status}" is not one of ${TRANSACTION_STATUSES.join(', ')}`,
    )
  }
  return row
}

/** Locks the row for the rest of the settlement, so a callback, a return and the cron take turns. */
export const lockTransaction = defineQuery(
  'payments.lockTransaction',
  (db, transactionId: TransactionId) =>
    db
      .select({
        amountInCents: transactions.amount,
        createdAs: transactions.createdAs,
        status: transactions.status,
        userId: transactions.userId,
      })
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .for('update'),
  (found) => knownStatus(firstOrNull(found)),
)

export const findProviderTxnIds = defineQuery(
  'payments.findProviderTxnIds',
  (db, transactionId: TransactionId) =>
    db
      .select({ providerTxnId: payments.providerTransactionId })
      .from(payments)
      .where(eq(payments.transactionId, transactionId)),
  (found) => found.map(({ providerTxnId }) => providerTxnId),
)

/**
 * The WHERE repeats the table, so the database refuses what the table refuses even if a plan is
 * wrong.
 */
export const moveTransaction = defineQuery(
  'payments.moveTransaction',
  (db, transition: Transition) =>
    db
      .update(transactions)
      .set({ status: transition.to })
      .where(
        and(
          eq(transactions.id, transition.transactionId),
          inArray(transactions.status, sourcesOf(transition.to)),
        ),
      )
      .returning({ status: transactions.status }),
  firstOrNull,
)

/** @public */
export const paymentTextFitsColumns: [
  SameLength<(typeof TEXT_COLUMN_LENGTHS)['TxnMessage'], typeof payments.message>,
  SameLength<(typeof TEXT_COLUMN_LENGTHS)['PymtMethod'], typeof payments.paymentMethod>,
] = [true, true]

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
          lt(transactions.createdAt, addMinutes(now(), -RECONCILE_MIN_AGE_MINUTES)),
          gt(transactions.createdAt, addDays(now(), -RECONCILE_WINDOW_DAYS)),
        ),
      )
      .orderBy(asc(transactions.createdAt))
      .limit(25),
  rows,
)

export const countStalePending = defineQuery(
  'payments.countStalePending',
  (db) =>
    db
      .select({ value: count() })
      .from(transactions)
      .where(
        and(
          eq(transactions.status, 'pending'),
          lte(transactions.createdAt, addDays(now(), -RECONCILE_WINDOW_DAYS)),
        ),
      ),
  (found) => found[0]?.value ?? 0,
)
