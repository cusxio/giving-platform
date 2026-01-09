import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, sql } from 'drizzle-orm'

import { clientTz } from '#/core/date'
import type { User } from '#/db/schema'
import { transactions } from '#/db/schema'
import { dbMiddleware } from '#/server/middleware'

interface Input {
  journey: User['journey']
}

export const getAvailableTransactionYears = createServerFn()
  .inputValidator((v: Input) => v)
  .middleware([dbMiddleware])
  .handler(async ({ context, data }) => {
    const { db, user } = context
    const { journey } = data

    if (!user) {
      throw notFound()
    }

    const userId = user.id

    const year =
      sql<number>`EXTRACT(YEAR FROM ${transactions.createdAt} AT TIME ZONE ${clientTz})::int`.as(
        'year',
      )
    const results = await db
      .selectDistinct({ year })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.status, 'success'),
          journey === 'start_fresh'
            ? eq(transactions.createdAs, 'user')
            : undefined,
        ),
      )
      .orderBy(asc(year))

    return results.map(({ year }) => year)
  })
