import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, sql } from 'drizzle-orm'

import { clientTz } from '#/core/date'
import { dbMiddleware } from '#/server/middleware/db-middleware'
import type { User } from '#/server/schema.server'
import { transactions } from '#/server/schema.server'

interface Input {
  journey: User['journey']
}

export const getAvailableTransactionYears = createServerFn()
  .validator((v: Input) => v)
  .middleware([dbMiddleware])
  .handler(async ({ context, data }) => {
    const { db, user } = context
    const { journey } = data

    if (!user) {
      throw notFound()
    }

    const userId = user.id

    const year =
      sql<number>`EXTRACT(YEAR FROM ${transactions.createdAt} AT TIME ZONE ${clientTz})::integer`.as(
        'year',
      )
    const results = await db
      .selectDistinct({ year })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.status, 'success'),
          journey === 'start_fresh' ? eq(transactions.createdAs, 'user') : undefined,
        ),
      )
      .orderBy(asc(year))

    return results.map(({ year }) => year)
  })
