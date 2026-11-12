import type { SQL } from 'drizzle-orm'
import { and, asc, count, countDistinct, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm'

import { clientTz } from '#/core/date'
import { COUNTED_STATUS } from '#/core/transaction-status'
import { defineQuery, firstOrNull, rows } from '#/server/db.server'
import { funds, payments, transactionItems, transactions } from '#/server/schema.server'
import { safeSum } from '#/server/sql.server'

/** Instants, from `start` up to but not including `end`. */
interface Span {
  readonly end: Date
  readonly start: Date
}

const createdWithin = (span: Span) =>
  and(gte(transactions.createdAt, span.start), lt(transactions.createdAt, span.end))

const countedWithin = (span: Span) =>
  and(eq(transactions.status, COUNTED_STATUS), createdWithin(span))

/**
 * Inlined rather than bound: GROUP BY must repeat a SELECT expression exactly, and two bindings of
 * one value are two different parameters to Postgres.
 */
const localTime = sql`(${transactions.createdAt} AT TIME ZONE '${sql.raw(clientTz)}')`

const sumWhere = (where: SQL | undefined) =>
  sql<number>`COALESCE(SUM(${transactions.amount}) FILTER (WHERE ${where}), 0)::integer`

const countWhere = (where: SQL | undefined) =>
  sql<number>`(COUNT(*) FILTER (WHERE ${where}))::integer`

/** The headline figures of a span, split by signed-in and guest gifts. Always one row. */
export const periodTotals = defineQuery(
  'analytics.periodTotals',
  (db, span: Span) => {
    const asUser = eq(transactions.createdAs, 'user')
    const asGuest = eq(transactions.createdAs, 'guest')
    return db
      .select({
        donors: countDistinct(transactions.userId),
        gifts: count(),
        guestAmount: sumWhere(asGuest),
        guestGifts: countWhere(asGuest),
        median: sql<number>`COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${transactions.amount}), 0)::float`,
        received: safeSum(transactions.amount),
        userAmount: sumWhere(asUser),
        userGifts: countWhere(asUser),
      })
      .from(transactions)
      .where(countedWithin(span))
  },
  firstOrNull,
)

/** Money per Kuala Lumpur month (`YYYY-MM`) and fund, oldest month first. */
export const monthlyByFund = defineQuery(
  'analytics.monthlyByFund',
  (db, span: Span) => {
    const month = sql<string>`to_char(${localTime}, 'YYYY-MM')`
    return db
      .select({ amount: safeSum(transactionItems.amount), fundName: funds.name, month })
      .from(transactions)
      .innerJoin(transactionItems, eq(transactionItems.transactionId, transactions.id))
      .innerJoin(funds, eq(funds.id, transactionItems.fundId))
      .where(countedWithin(span))
      .groupBy(month, funds.name)
      .orderBy(asc(month), asc(funds.name))
  },
  rows,
)

interface DonorWindows {
  readonly compare: Span
  readonly last12Months: Span
  readonly months12to24: Span
  readonly months24to36: Span
  readonly period: Span
  readonly yearBeforePeriod: Span
}

/**
 * One row per donor who ever gave, with their gifts summed over each window. It groups by donor
 * but selects no id, so nothing downstream can name one.
 */
export const donorWindows = defineQuery(
  'analytics.donorWindows',
  (db, windows: DonorWindows) =>
    db
      .select({
        compare: sumWhere(createdWithin(windows.compare)),
        firstGiftAt: sql<Date>`MIN(${transactions.createdAt})`.mapWith(transactions.createdAt),
        last12Months: sumWhere(createdWithin(windows.last12Months)),
        months12to24: sumWhere(createdWithin(windows.months12to24)),
        months24to36: sumWhere(createdWithin(windows.months24to36)),
        monthsGivenLast12: sql<number>`(COUNT(DISTINCT to_char(${localTime}, 'YYYY-MM')) FILTER (WHERE ${createdWithin(windows.last12Months)}))::integer`,
        period: sumWhere(createdWithin(windows.period)),
        yearBeforePeriod: sumWhere(createdWithin(windows.yearBeforePeriod)),
      })
      .from(transactions)
      .where(eq(transactions.status, COUNTED_STATUS))
      .groupBy(transactions.userId),
  rows,
)

const itemSumAs = (createdAs: 'guest' | 'user') =>
  sql<number>`COALESCE(SUM(${transactionItems.amount}) FILTER (WHERE ${eq(transactions.createdAs, createdAs)}), 0)::integer`

/** Money, gift count, and signed-in and guest money per fund. A split gift counts in each fund. */
export const fundTotals = defineQuery(
  'analytics.fundTotals',
  (db, span: Span) =>
    db
      .select({
        amount: safeSum(transactionItems.amount),
        fundName: funds.name,
        gifts: countDistinct(transactions.id),
        guest: itemSumAs('guest'),
        signedIn: itemSumAs('user'),
      })
      .from(transactions)
      .innerJoin(transactionItems, eq(transactionItems.transactionId, transactions.id))
      .innerJoin(funds, eq(funds.id, transactionItems.fundId))
      .where(countedWithin(span))
      .groupBy(funds.name),
  rows,
)

/**
 * Running totals per year and week, a week counted from 1 January (day 1 to 7 is week 1). ISO
 * weeks would file 1 January under the last week of the year before.
 */
export const weeklyCumulativeTotalsByYear = defineQuery(
  'analytics.weeklyCumulativeTotalsByYear',
  (db, span: Span) => {
    const week = sql<number>`((EXTRACT(DOY FROM ${localTime})::integer - 1) / 7 + 1)`
    const year = sql<number>`EXTRACT(YEAR FROM ${localTime})::integer`

    const weeklyTotals = db.$with('weekly_totals').as(
      db
        .select({
          week: week.as('week'),
          weeklyAmount: safeSum(transactions.amount).as('weekly_amount'),
          year: year.as('year'),
        })
        .from(transactions)
        .where(countedWithin(span))
        .groupBy(year, week),
    )

    return db
      .with(weeklyTotals)
      .select({
        cumulative: sql<number>`SUM(${weeklyTotals.weeklyAmount}) OVER (PARTITION BY ${weeklyTotals.year} ORDER BY ${weeklyTotals.week})::integer`,
        week: weeklyTotals.week,
        year: weeklyTotals.year,
      })
      .from(weeklyTotals)
      .orderBy(asc(weeklyTotals.year), asc(weeklyTotals.week))
  },
  rows,
)

/** Gifts and money per size band. `bucket` is 0 below `bounds[0]`, and i from `bounds[i - 1]`. */
export const giftSizeBands = defineQuery(
  'analytics.giftSizeBands',
  (db, span: Span, bounds: readonly number[]) => {
    if (!bounds.every((bound) => Number.isSafeInteger(bound))) {
      throw new Error(`gift band bounds must be integers: ${bounds.join(', ')}`)
    }
    const thresholds = sql.raw(bounds.join(', '))
    const bucket = sql<number>`width_bucket(${transactions.amount}, ARRAY[${thresholds}]::integer[])`
    return db
      .select({ amount: safeSum(transactions.amount), bucket, gifts: count() })
      .from(transactions)
      .where(countedWithin(span))
      .groupBy(bucket)
  },
  rows,
)

/** Gifts per Kuala Lumpur weekday (1 is Monday) and three-hour block (0 is midnight to 3am). */
export const givingHeatmap = defineQuery(
  'analytics.givingHeatmap',
  (db, span: Span) => {
    const weekday = sql<number>`EXTRACT(ISODOW FROM ${localTime})::integer`
    const block = sql<number>`(EXTRACT(HOUR FROM ${localTime})::integer / 3)`
    return db
      .select({ block, gifts: count(), weekday })
      .from(transactions)
      .where(countedWithin(span))
      .groupBy(weekday, block)
  },
  rows,
)

/**
 * Settled payment attempts per payment method, read from each transaction's newest payments row.
 * An attempt with no payments row has a null method.
 */
export const paymentMethodOutcomes = defineQuery(
  'analytics.paymentMethodOutcomes',
  (db, span: Span) => {
    const latest = db
      .select({ method: payments.paymentMethod })
      .from(payments)
      .where(eq(payments.transactionId, transactions.id))
      .orderBy(desc(payments.id))
      .limit(1)
      .as('latest')
    return db
      .select({
        cancelled: countWhere(eq(transactions.status, 'cancelled')),
        failed: countWhere(eq(transactions.status, 'failed')),
        method: latest.method,
        succeeded: countWhere(eq(transactions.status, COUNTED_STATUS)),
      })
      .from(transactions)
      .leftJoinLateral(latest, sql`true`)
      .where(
        and(
          inArray(transactions.status, [COUNTED_STATUS, 'failed', 'cancelled']),
          createdWithin(span),
        ),
      )
      .groupBy(latest.method)
  },
  rows,
)

/** Held transactions of any age, each waiting for an operator at eGHL. */
export const countHeld = defineQuery(
  'analytics.countHeld',
  (db) => db.select({ value: count() }).from(transactions).where(eq(transactions.status, 'held')),
  (found) => found[0]?.value ?? 0,
)
