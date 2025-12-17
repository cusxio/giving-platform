import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, sql } from 'drizzle-orm'

import { getTzOffsetModifier } from '#/core/date'
import type { User } from '#/db/schema'
import { transactions } from '#/db/schema'
import { dbMiddleware } from '#/server/middleware'

interface Input {
  journey: User['journey']
  userId: User['id']
}

export const getAvailableTransactionYears = createServerFn()
  .inputValidator((v: Input) => v)
  .middleware([dbMiddleware])
  .handler(async ({ context, data }) => {
    const { db } = context
    const { userId, journey } = data

    const modifier = getTzOffsetModifier()
    const year = sql<string>`strftime('%Y', ${transactions.createdAt}, ${modifier})`
    const results = await db
      .selectDistinct({ year: year.mapWith(Number.parseInt) })
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
