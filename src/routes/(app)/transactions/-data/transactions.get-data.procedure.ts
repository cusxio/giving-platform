import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { and, count, desc, eq, inArray } from 'drizzle-orm'

import type { Transaction, User } from '#/db/schema'
import { transactions } from '#/db/schema'
import { dbMiddleware } from '#/server/middleware/db-middleware'

interface Input {
  journey: User['journey']
  page?: number
}

const pageSize = 20

export const getTransactionsData = createServerFn()
  .middleware([dbMiddleware])
  .validator((v: Input) => v)
  .handler(async ({ context, data }) => {
    const { page = 1, journey } = data
    const { db, user } = context

    if (!user) {
      throw notFound()
    }

    const userId = user.id

    const whereClause = and(
      eq(transactions.userId, userId),
      inArray(transactions.status, ['success', 'failed']),
      journey === 'start_fresh' ? eq(transactions.createdAs, 'user') : undefined,
    )

    const [total, txs] = await db.batch([
      db.select({ value: count() }).from(transactions).where(whereClause),
      db
        .select({
          amount: transactions.amount,
          createdAt: transactions.createdAt,
          id: transactions.id,
          status: transactions.status,
        })
        .from(transactions)
        .where(whereClause)
        .orderBy(desc(transactions.createdAt))
        .limit(pageSize)
        .offset(pageSize * (page - 1)),
    ])

    return toTransactionsPage(total, txs)
  })

export function toTransactionsPage(
  total: { value: number }[],
  txs: Pick<Transaction, 'amount' | 'createdAt' | 'id' | 'status'>[],
) {
  return { pageSize, totalCount: total[0]?.value ?? 0, transactions: txs }
}
