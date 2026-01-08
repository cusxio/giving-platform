import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { and, count, desc, eq, inArray } from 'drizzle-orm'

import type { User } from '#/db/schema'
import { transactions } from '#/db/schema'
import { dbMiddleware } from '#/server/middleware'

interface Input {
  journey: User['journey']
  page?: number
  userId: User['id']
}

const pageSize = 20

export const getTransactionsData = createServerFn()
  .middleware([dbMiddleware])
  .inputValidator((v: Input) => v)
  .handler(async ({ context, data }) => {
    const { userId, page = 1, journey } = data
    const { db, session } = context

    if (userId !== session?.userId) {
      throw notFound()
    }

    const whereClause = and(
      eq(transactions.userId, userId),
      inArray(transactions.status, ['success', 'failed']),
      journey === 'start_fresh'
        ? eq(transactions.createdAs, 'user')
        : undefined,
    )

    const [total, txs] = await db.batch([
      db.select({ value: count() }).from(transactions).where(whereClause),
      db
        .select({
          id: transactions.id,
          amount: transactions.amount,
          status: transactions.status,
          createdAt: transactions.createdAt,
        })
        .from(transactions)
        .where(whereClause)
        .orderBy(desc(transactions.createdAt))
        .limit(pageSize)
        .offset(pageSize * (page - 1)),
    ])

    return { totalCount: total[0]?.value ?? 0, transactions: txs, pageSize }
  })
