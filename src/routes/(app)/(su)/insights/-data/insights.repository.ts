import { and, asc, count, eq, gte, sql } from 'drizzle-orm'

import { clientTz } from '#/core/date'
import { roundedAvg, safeSum } from '#/db/aggregates'
import { DB } from '#/db/client'
import { transactions } from '#/db/schema'
export class InsightsRepository {
  #db: DB
  constructor(db: DB) {
    this.#db = db
  }

  transactionSummaryQuery() {
    return this.#db
      .select({
        totalAmount: safeSum(transactions.amount),
        noOfContributions: count(),
        averageAmount: roundedAvg(transactions.amount),
        medianAmount: sql<number>`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${transactions.amount})`,
      })
      .from(transactions)
      .where(eq(transactions.status, 'success'))
  }

  userGuestTransanctionCountQuery() {
    return this.#db
      .select({ createdAs: transactions.createdAs, count: count() })
      .from(transactions)
      .where(eq(transactions.status, 'success'))
      .groupBy(transactions.createdAs)
  }

  weekendWeekdayTransactionCountQuery() {
    const period = sql<string>`
      CASE
        WHEN EXTRACT(DOW FROM ${transactions.createdAt} AT TIME ZONE ${clientTz}) IN (0, 6)
        THEN 'weekend'
        ELSE 'weekday'
      END
    `
    return this.#db
      .select({ period: period.as('period'), count: count() })
      .from(transactions)
      .where(eq(transactions.status, 'success'))
      .groupBy(period)
  }

  weeklyCumulativeTotalsByYearQuery() {
    const week = sql<number>`EXTRACT(WEEK FROM ${transactions.createdAt} AT TIME ZONE ${clientTz})::int`
    const year = sql<number>`EXTRACT(YEAR FROM ${transactions.createdAt} AT TIME ZONE ${clientTz})::int`
    const cutoffYear = sql<number>`EXTRACT(YEAR FROM NOW() AT TIME ZONE ${clientTz})::int - 4`

    const weeklyTotals = this.#db.$with('weekly_totals').as(
      this.#db
        .select({
          year: year.as('year'),
          week: week.as('week'),
          weeklyAmount: safeSum(transactions.amount).as('weeklyAmount'),
        })
        .from(transactions)
        .where(and(eq(transactions.status, 'success'), gte(year, cutoffYear)))
        .groupBy(year, week),
    )
    return this.#db
      .with(weeklyTotals)
      .select({
        year: weeklyTotals.year,
        week: weeklyTotals.week,
        weeklyAmount: weeklyTotals.weeklyAmount,
        cumulativeAmount: sql<number>`SUM(${weeklyTotals.weeklyAmount}) OVER (PARTITION BY ${weeklyTotals.year} ORDER BY ${weeklyTotals.week})`,
      })
      .from(weeklyTotals)
      .orderBy(asc(weeklyTotals.year), asc(weeklyTotals.week))
  }
}
