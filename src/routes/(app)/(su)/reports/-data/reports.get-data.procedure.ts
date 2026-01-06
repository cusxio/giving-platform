import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq, gte, lt } from 'drizzle-orm'

import { centsToRinggit } from '#/core/money'
import { safeSum } from '#/db/aggregates'
import { funds, transactionItems, transactions } from '#/db/schema'
import { dbMiddleware } from '#/server/middleware'

interface Input {
  endDateUTCExclusive: Date
  startDateUTC: Date
}

export const getReportsData = createServerFn()
  .middleware([dbMiddleware])
  .inputValidator((v: Input) => v)
  .handler(async ({ context, data }) => {
    const { startDateUTC, endDateUTCExclusive } = data
    const { db } = context

    // Aggregate first, then join to funds for name lookup
    const aggregated = db
      .select({
        fundId: transactionItems.fundId,
        createdAs: transactions.createdAs,
        totalAmount: safeSum(transactionItems.amount),
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.status, 'success'),
          gte(transactions.createdAt, startDateUTC),
          lt(transactions.createdAt, endDateUTCExclusive),
        ),
      )
      .innerJoin(
        transactionItems,
        eq(transactionItems.transactionId, transactions.id),
      )
      .groupBy(transactionItems.fundId, transactions.createdAs)
      .as('aggregated')

    const rows = await db
      .select({
        fundName: funds.name,
        createdAs: aggregated.createdAs,
        totalAmount: aggregated.totalAmount,
      })
      .from(aggregated)
      .innerJoin(funds, eq(funds.id, aggregated.fundId))
      .orderBy(desc(aggregated.createdAs), asc(funds.name))

    return rows.map((row) => ({
      ...row,
      totalAmount: centsToRinggit(row.totalAmount),
    }))
  })
