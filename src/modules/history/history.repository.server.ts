import { and, asc, count, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm'

import { clientTz } from '#/core/date'
import { COUNTED_STATUS, LISTED_STATUSES } from '#/core/transaction-status'
import { defineQuery, firstOrNull, rows } from '#/server/db.server'
import type { Transaction, User } from '#/server/schema.server'
import { funds, transactionItems, transactions } from '#/server/schema.server'

/** The signed-in user whose giving history a query reads. */
export type Donor = Pick<User, 'id' | 'journey'>

export type TransactionId = Transaction['id']

/** A donor's transactions created in `[start, endExclusive)`; an unset bound leaves that side open. */
export interface DonorScope {
  readonly donor: Donor
  readonly endExclusive: Date | undefined
  readonly start: Date | undefined
}

/** A donor who chose to start fresh sees only what they gave while signed in, not as a guest. */
function startFreshOnly(journey: Donor['journey']) {
  return journey === 'start_fresh' ? eq(transactions.createdAs, 'user') : undefined
}

function inScope(scope: DonorScope) {
  return [
    eq(transactions.userId, scope.donor.id),
    scope.start ? gte(transactions.createdAt, scope.start) : undefined,
    scope.endExclusive ? lt(transactions.createdAt, scope.endExclusive) : undefined,
    startFreshOnly(scope.donor.journey),
  ]
}

export const recentTransactions = defineQuery(
  'history.recentTransactions',
  (db, scope: DonorScope) =>
    db
      .select({
        amount: transactions.amount,
        createdAt: transactions.createdAt,
        id: transactions.id,
        status: transactions.status,
      })
      .from(transactions)
      .where(and(...inScope(scope), inArray(transactions.status, LISTED_STATUSES)))
      .orderBy(desc(transactions.createdAt))
      .limit(15),
  rows,
)

export const successTimeline = defineQuery(
  'history.successTimeline',
  (db, scope: DonorScope) =>
    db
      .select({ amount: transactions.amount, createdAt: transactions.createdAt })
      .from(transactions)
      .where(and(...inScope(scope), eq(transactions.status, COUNTED_STATUS))),
  rows,
)

export const successFundItems = defineQuery(
  'history.successFundItems',
  (db, scope: DonorScope) =>
    db
      .select({
        createdAt: transactions.createdAt,
        fundId: transactionItems.fundId,
        fundName: funds.name,
      })
      .from(transactionItems)
      .innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
      .innerJoin(funds, eq(transactionItems.fundId, funds.id))
      .where(and(...inScope(scope), eq(transactions.status, COUNTED_STATUS))),
  rows,
)

/** Kuala Lumpur calendar years with a successful transaction, ascending. */
export const successYears = defineQuery(
  'history.successYears',
  (db, donor: Donor) => {
    const year =
      sql<number>`EXTRACT(YEAR FROM ${transactions.createdAt} AT TIME ZONE ${clientTz})::integer`.as(
        'year',
      )
    return db
      .selectDistinct({ year })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, donor.id),
          eq(transactions.status, COUNTED_STATUS),
          startFreshOnly(donor.journey),
        ),
      )
      .orderBy(asc(year))
  },
  (found) => found.map(({ year }) => year),
)

function listedFor(donor: Donor) {
  return and(
    eq(transactions.userId, donor.id),
    inArray(transactions.status, LISTED_STATUSES),
    startFreshOnly(donor.journey),
  )
}

export const countTransactions = defineQuery(
  'history.countTransactions',
  (db, donor: Donor) => db.select({ value: count() }).from(transactions).where(listedFor(donor)),
  rows,
)

export const transactionsPage = defineQuery(
  'history.transactionsPage',
  (db, donor: Donor, page: { readonly limit: number; readonly offset: number }) =>
    db
      .select({
        amount: transactions.amount,
        createdAt: transactions.createdAt,
        id: transactions.id,
        status: transactions.status,
      })
      .from(transactions)
      .where(listedFor(donor))
      .orderBy(desc(transactions.createdAt))
      .limit(page.limit)
      .offset(page.offset),
  rows,
)

export const transactionById = defineQuery(
  'history.transactionById',
  (db, transactionId: TransactionId) =>
    db.select().from(transactions).where(eq(transactions.id, transactionId)),
  firstOrNull,
)

/** A transaction's fund rows, in the order they were added. */
export const transactionItemsOf = defineQuery(
  'history.transactionItemsOf',
  (db, transactionId: TransactionId) =>
    db
      .select({ amountInCents: transactionItems.amount, fundName: funds.name })
      .from(transactionItems)
      .innerJoin(funds, eq(funds.id, transactionItems.fundId))
      .where(eq(transactionItems.transactionId, transactionId))
      .orderBy(asc(transactionItems.id)),
  rows,
)
