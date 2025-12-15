import { and, asc, count, eq, gte, sql } from 'drizzle-orm'

import { getTzOffsetModifier } from '#/core/date'
import { createDBError } from '#/core/errors'
import { ok, tryAsync } from '#/core/result'
import { roundedAvg, safeSum } from '#/db/aggregates'
import { DB } from '#/db/client'
import { transactions } from '#/db/schema'

export class InsightsRepository {
  #db: DB

  constructor(db: DB) {
    this.#db = db
  }

  async getMedianAmount() {
    const countRes = await tryAsync(
      () =>
        this.#db
          .select({ count: count() })
          .from(transactions)
          .where(eq(transactions.status, 'success')),
      createDBError,
    )

    if (!countRes.ok) return countRes

    const total = countRes.value[0]?.count ?? 0

    if (total === 0) return ok(total)

    const middleIndex = Math.floor(total / 2)

    const medianRes = await tryAsync(
      () =>
        this.#db
          .select({ amountInCents: transactions.amount })
          .from(transactions)
          .where(eq(transactions.status, 'success'))
          .orderBy(transactions.amount)
          .limit(1)
          .offset(middleIndex),
      createDBError,
    )

    if (!medianRes.ok) return medianRes

    return ok(medianRes.value[0]?.amountInCents ?? 0)
  }

  transactionSummaryQuery() {
    return this.#db
      .select({
        totalAmount: safeSum(transactions.amount),
        noOfContributions: count(),
        averageAmount: roundedAvg(transactions.amount),
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
    const modifier = getTzOffsetModifier()
    const period = sql<string>`
      CASE
        WHEN strftime('%w', ${transactions.createdAt}, ${modifier}) IN ('0','6')
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
    const modifier = getTzOffsetModifier()

    const week = sql<string>`
      CASE 
        WHEN strftime('%W', ${transactions.createdAt}, ${modifier}) = '00' 
        THEN '01' 
        ELSE strftime('%W', ${transactions.createdAt}, ${modifier}) 
      END
    `
    const year = sql<string>`strftime('%Y', ${transactions.createdAt}, ${modifier})`
    const cutoffYear = sql`strftime('%Y', 'now', ${modifier}, '-4 years')`

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
        cumulativeAmount: sql<number>`sum(${weeklyTotals.weeklyAmount}) OVER (PARTITION BY ${weeklyTotals.year} ORDER BY CAST(${weeklyTotals.week} AS integer))`,
      })
      .from(weeklyTotals)
      .orderBy(asc(weeklyTotals.year), asc(weeklyTotals.week))
  }
}
