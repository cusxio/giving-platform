import type { SQL } from 'drizzle-orm'
import { count, desc, eq, max, sql } from 'drizzle-orm'

import { clientTz } from '#/core/date'
import { roundedAvg, safeSum } from '#/db/aggregates'
import type { DB } from '#/db/client'
import { funds, transactionItems, transactions } from '#/db/schema'

type WhereClause = SQL | undefined

export class OverviewRepository {
  #db: DB

  constructor(db: DB) {
    this.#db = db
  }

  contributionsFrequencyPerMonthQuery(whereClause: WhereClause) {
    const month = sql<number>`EXTRACT(MONTH FROM ${transactions.createdAt} AT TIME ZONE ${clientTz})::int`

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

  contributionsPerMonthQuery(whereClause: WhereClause) {
    const month = sql<number>`EXTRACT(MONTH FROM ${transactions.createdAt} AT TIME ZONE ${clientTz})::int`

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

  cumulativeContributionsQuery(whereClause: WhereClause) {
    const day = sql<string>`TO_CHAR(${transactions.createdAt} AT TIME ZONE ${clientTz}, 'YYYY-MM-DD')`
    return this.#db
      .select({
        day,
        cumulativeAmount: sql<number>`SUM(SUM(${transactions.amount})) OVER (ORDER BY ${day})`,
      })
      .from(transactions)
      .where(whereClause)
      .groupBy(day)
      .orderBy(day)
  }

  getTotalFundsSupported(whereClause: WhereClause) {
    return this.#db
      .select({
        totalFundsSupported: sql<number>`COUNT(DISTINCT ${transactionItems.fundId})`,
      })
      .from(transactions)
      .innerJoin(
        transactionItems,
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
