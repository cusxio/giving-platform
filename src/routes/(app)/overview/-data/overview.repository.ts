import { asc, count, desc, eq, max, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import { roundedAvg, safeSum } from '#/db/aggregates'
import type { DB } from '#/db/client'
import { funds, transactionItems, transactions } from '#/db/schema'

type WhereClause = SQL | undefined

export class OverviewRepository {
  #db: DB

  constructor(db: DB) {
    this.#db = db
  }

  contributionsFrequencyPerMonthQuery(
    whereClause: WhereClause,
    modifier: string,
  ) {
    const month =
      sql<string>`strftime('%m', ${transactions.createdAt}, ${modifier})`.mapWith(
        Number.parseInt,
      )
    return this.#db
      .select({
        month,
        fund: funds.name,
        frequency: count(transactionItems.id),
      })
      .from(transactions)
      .innerJoin(
        transactionItems,
        eq(transactions.id, transactionItems.transactionId),
      )
      .innerJoin(funds, eq(transactionItems.fundId, funds.id))
      .where(whereClause)
      .groupBy(month, funds.name)
      .orderBy(month, funds.name)
  }

  contributionsPerMonthQuery(whereClause: WhereClause, modifier: string) {
    const month =
      sql<string>`strftime('%m', ${transactions.createdAt}, ${modifier})`.mapWith(
        Number.parseInt,
      )

    return this.#db
      .select({ month, totalAmount: safeSum(transactions.amount) })
      .from(transactions)
      .where(whereClause)
      .groupBy(month)
      .orderBy(month)
  }

  contributionStatsQuery(whereClause: WhereClause) {
    return this.#db
      .select({
        totalAmount: safeSum(transactions.amount),
        noOfContributions: count(transactions.id),
        averageAmount: roundedAvg(transactions.amount),
        largestAmount: max(transactions.amount),
      })
      .from(transactions)
      .where(whereClause)
  }

  cumulativeContributionsQuery(whereClause: WhereClause, modifier: string) {
    const format = '%Y-%m-%d'
    const day = sql<string>`strftime(${format}, ${transactions.createdAt}, ${modifier})`

    const dailyTotals = this.#db.$with('daily_totals').as(
      this.#db
        .select({
          day: day.as('day'),
          dailyAmount: safeSum(transactions.amount).as('daily_amount'),
        })
        .from(transactions)
        .where(whereClause)
        .groupBy(day),
    )

    return this.#db
      .with(dailyTotals)
      .select({
        day: dailyTotals.day,
        cumulativeAmount: sql<number>`sum(${dailyTotals.dailyAmount}) OVER (ORDER BY ${dailyTotals.day})`,
      })
      .from(dailyTotals)
      .orderBy(asc(dailyTotals.day))
  }

  getTotalFundsSupported(whereClause: WhereClause) {
    return this.#db
      .select({
        totalFundsSupported: sql<number>`COUNT(DISTINCT ${transactionItems.fundId})`,
      })
      .from(transactionItems)
      .innerJoin(
        transactions,
        eq(transactionItems.transactionId, transactions.id),
      )
      .where(whereClause)
  }

  getTransactionsQuery(whereClause: WhereClause) {
    return this.#db
      .select({
        id: transactions.id,
        amount: transactions.amount,
        status: transactions.status,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .where(whereClause)
      .orderBy(desc(transactions.createdAt))
      .limit(15)
  }

  largestTransactionDateQuery(whereClause: WhereClause) {
    return this.#db
      .select({ date: transactions.createdAt })
      .from(transactions)
      .where(whereClause)
      .orderBy(desc(transactions.amount))
      .limit(1)
  }
}
