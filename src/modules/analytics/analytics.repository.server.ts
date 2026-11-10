import { and, asc, count, desc, eq, gte, lt, sql } from 'drizzle-orm'

import { clientTz } from '#/core/date'
import { COUNTED_STATUS } from '#/core/transaction-status'
import { defineQuery, rows } from '#/server/db.server'
import { funds, transactionItems, transactions } from '#/server/schema.server'
import { roundedAvg, safeSum } from '#/server/sql.server'

/**
 * Combined query for all summary statistics in a single table scan.
 * Uses conditional aggregates (FILTER clause) to compute multiple metrics at once.
 */
export const insightsSummary = defineQuery(
  'analytics.insightsSummary',
  (db) =>
    db
      .select({
        // Core stats
        totalAmount: safeSum(transactions.amount),
        noOfContributions: count(),
        averageAmount: roundedAvg(transactions.amount),
        medianAmount: sql<number>`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${transactions.amount})`,
        // User vs Guest breakdown
        userCount: sql<number>`COUNT(*) FILTER (WHERE ${transactions.createdAs} = 'user')::integer`,
        guestCount: sql<number>`COUNT(*) FILTER (WHERE ${transactions.createdAs} = 'guest')::integer`,
        // Weekend vs Weekday breakdown
        weekendCount: sql<number>`COUNT(*) FILTER (WHERE EXTRACT(DOW FROM ${transactions.createdAt} AT TIME ZONE ${clientTz}) IN (0, 6))::integer`,
        weekdayCount: sql<number>`COUNT(*) FILTER (WHERE EXTRACT(DOW FROM ${transactions.createdAt} AT TIME ZONE ${clientTz}) NOT IN (0, 6))::integer`,
      })
      .from(transactions)
      .where(eq(transactions.status, COUNTED_STATUS)),
  rows,
)

export const weeklyCumulativeTotalsByYear = defineQuery(
  'analytics.weeklyCumulativeTotalsByYear',
  (db) => {
    const week = sql<number>`EXTRACT(WEEK FROM ${transactions.createdAt} AT TIME ZONE ${clientTz})::integer`
    const year = sql<number>`EXTRACT(YEAR FROM ${transactions.createdAt} AT TIME ZONE ${clientTz})::integer`
    const cutoffYear = sql<number>`EXTRACT(YEAR FROM NOW() AT TIME ZONE ${clientTz})::integer - 4`

    const weeklyTotals = db.$with('weekly_totals').as(
      db
        .select({
          week: week.as('week'),
          weeklyAmount: safeSum(transactions.amount).as('weeklyAmount'),
          year: year.as('year'),
        })
        .from(transactions)
        .where(and(eq(transactions.status, COUNTED_STATUS), gte(year, cutoffYear)))
        .groupBy(year.as('year'), week.as('week')),
    )

    return db
      .with(weeklyTotals)
      .select({
        cumulativeAmount: sql<number>`SUM(${weeklyTotals.weeklyAmount}) OVER (PARTITION BY ${weeklyTotals.year} ORDER BY ${weeklyTotals.week})::integer`,
        week: weeklyTotals.week,
        weeklyAmount: weeklyTotals.weeklyAmount,
        year: weeklyTotals.year,
      })
      .from(weeklyTotals)
      .orderBy(asc(weeklyTotals.year), asc(weeklyTotals.week))
  },
  rows,
)

/** Successful transactions created in `[start, endExclusive)`. */
interface ReportRange {
  readonly endExclusive: Date
  readonly start: Date
}

/** Totals per fund and per donor kind (signed-in or guest), guests last, then by fund name. */
export const fundTotals = defineQuery(
  'analytics.fundTotals',
  (db, range: ReportRange) => {
    // Aggregate first, then join to funds for name lookup
    const aggregated = db
      .select({
        createdAs: transactions.createdAs,
        fundId: transactionItems.fundId,
        totalAmount: safeSum(transactionItems.amount).as('totalAmount'),
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.status, COUNTED_STATUS),
          gte(transactions.createdAt, range.start),
          lt(transactions.createdAt, range.endExclusive),
        ),
      )
      .innerJoin(transactionItems, eq(transactionItems.transactionId, transactions.id))
      .groupBy(transactionItems.fundId, transactions.createdAs)
      .as('aggregated')

    return db
      .select({
        createdAs: aggregated.createdAs,
        fundName: funds.name,
        totalAmount: aggregated.totalAmount,
      })
      .from(aggregated)
      .innerJoin(funds, eq(funds.id, aggregated.fundId))
      .orderBy(desc(aggregated.createdAs), asc(funds.name))
  },
  rows,
)
