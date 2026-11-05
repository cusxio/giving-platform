import { and, asc, count, desc, eq, gt, inArray, lt, lte, sql } from 'drizzle-orm'

import { addDays, addMinutes, now } from '#/core/date'
import { sourcesOf, TRANSACTION_STATUSES } from '#/core/transaction-status'
import { defineQuery, firstOrNull, nothing, rawStatement, rows } from '#/server/db.server'
import type { PaymentInsert, Transaction, TransactionItem, User } from '#/server/schema.server'
import { funds, payments, transactions, users } from '#/server/schema.server'
import type { SameLength } from '#/server/sql.server'

import type { TEXT_COLUMN_LENGTHS } from './eghl.outcome'
import type { Transition } from './payment-outcome'
import { RECONCILE_MIN_AGE_MINUTES, RECONCILE_WINDOW_DAYS } from './payment-outcome'

export type TransactionId = Transaction['id']

export { newTransactionId } from '#/server/schema.server'

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

/** The signed-in user's pending transaction. */
export const insertPendingTransaction = defineQuery(
  'payments.insertPendingTransaction',
  (db, input: Pick<Transaction, 'amount' | 'id' | 'userId'>) =>
    db
      .insert(transactions)
      .values({ ...input, createdAs: 'user', status: 'pending' })
      .returning(),
  firstOrNull,
)

/** The pending transaction of the guest with `email`. Inserts nothing when no guest has it. */
export const insertPendingGuestTransaction = defineQuery(
  'payments.insertPendingGuestTransaction',
  (db, input: Pick<Transaction, 'amount' | 'id'> & Pick<User, 'email'>) =>
    rawStatement(
      db,
      sql`insert into ${transactions} ("id", "amount", "created_as", "status", "user_id")
        select ${input.id}::varchar, ${input.amount}::integer, 'guest', 'pending', ${users.id}
        from ${users} where ${users.email} = ${input.email} and ${users.status} = 'guest'
        returning "id"`,
    ),
  ({ rows: inserted }) => firstOrNull(inserted) as Pick<Transaction, 'id'> | null,
)

/** Inserts nothing when no transaction has `transactionId`. */
export const insertTransactionItems = defineQuery(
  'payments.insertTransactionItems',
  (
    db,
    transactionId: TransactionId,
    items: readonly Pick<TransactionItem, 'amount' | 'fundId'>[],
  ) =>
    rawStatement(
      db,
      sql`insert into "transaction_items" ("transaction_id", "fund_id", "amount")
        select ${transactions.id}, item.fund_id, item.amount from ${transactions},
        (values ${sql.join(
          items.map((item) => sql`(${item.fundId}::varchar, ${item.amount}::integer)`),
          sql`, `,
        )}) as item (fund_id, amount)
        where ${transactions.id} = ${transactionId}`,
    ),
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

export const claimTransactionsToReconcile = defineQuery(
  'payments.claimTransactionsToReconcile',
  (db) =>
    db
      .update(transactions)
      .set({ updatedAt: now() })
      .where(
        and(
          inArray(
            transactions.id,
            db
              .select({ id: transactions.id })
              .from(transactions)
              .where(
                and(
                  eq(transactions.status, 'pending'),
                  lt(transactions.createdAt, addMinutes(now(), -RECONCILE_MIN_AGE_MINUTES)),
                  gt(transactions.createdAt, addDays(now(), -RECONCILE_WINDOW_DAYS)),
                ),
              )
              .orderBy(asc(transactions.updatedAt))
              .limit(25),
          ),
          // Read Committed rechecks this outer WHERE on a row a concurrent writer settled, but the
          // subquery keeps its start-of-statement snapshot.
          // https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED
          eq(transactions.status, 'pending'),
        ),
      )
      .returning({
        amountInCents: transactions.amount,
        createdAt: transactions.createdAt,
        transactionId: transactions.id,
      }),
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
