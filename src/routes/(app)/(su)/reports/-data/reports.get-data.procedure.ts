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

    const createdAt = transactions.createdAt

    const rows = await db
      .select({
        fundName: funds.name,
        createdAs: transactions.createdAs,
        totalAmount: safeSum(transactionItems.amount),
      })
      .from(transactions)
      // Uses index: transactions_status_created_at_id_created_as_idx
      .where(
        and(
          eq(transactions.status, 'success'),
          gte(createdAt, startDateUTC),
          lt(createdAt, endDateUTCExclusive),
        ),
      )
      // Uses index: transaction_items_transaction_id_fund_id_amount_idx
      .innerJoin(
        transactionItems,
        eq(transactionItems.transactionId, transactions.id),
      )
      .innerJoin(funds, eq(funds.id, transactionItems.fundId))
      .groupBy(funds.name, transactions.createdAs)
      .orderBy(desc(transactions.createdAs), asc(funds.name))

    return rows.map((row) => ({
      ...row,
      totalAmount: centsToRinggit(row.totalAmount),
    }))
  })
