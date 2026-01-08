import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, gte, inArray, lt } from 'drizzle-orm'

import { clientTz, TZDate } from '#/core/date'
import { centsToRinggit } from '#/core/money'
import type { User } from '#/db/schema'
import { funds, transactionItems, transactions } from '#/db/schema'
import { dbMiddleware } from '#/server/middleware'

import { getYearDateRange } from './overview.helpers'

export type GetOverviewDataResponse = Awaited<
  ReturnType<typeof getOverviewData>
>

interface Input {
  journey: User['journey']
  userId: User['id']
  year: 'all' | number
}

export const getOverviewData = createServerFn()
  .middleware([dbMiddleware])
  .inputValidator((v: Input) => v)
  .handler(async ({ context, data }) => {
    const { db, session } = context
    const { userId, year, journey } = data

    if (userId !== session?.userId) {
      throw notFound()
    }

    const { startDateUTC, endDateUTCExclusive } = getYearDateRange(year)

    // Base conditions
    const conditions = [
      eq(transactions.userId, userId),
      startDateUTC ? gte(transactions.createdAt, startDateUTC) : undefined,
      endDateUTCExclusive
        ? lt(transactions.createdAt, endDateUTCExclusive)
        : undefined,
      journey === 'start_fresh'
        ? eq(transactions.createdAs, 'user')
        : undefined,
    ].filter(Boolean)

    const successWhereClause = and(
      ...conditions,
      eq(transactions.status, 'success'),
    )

    // We only need failed/success for the Recent Transactions list
    const allStatusWhereClause = and(
      ...conditions,
      inArray(transactions.status, ['success', 'failed']),
    )

    const [recentTransactions, timelineData, fundData] = await db.batch([
      // Query 1: Recent Transactions (Optimized: Sort & Limit in DB)
      db
        .select({
          id: transactions.id,
          amount: transactions.amount,
          status: transactions.status,
          createdAt: transactions.createdAt,
        })
        .from(transactions)
        .where(allStatusWhereClause)
        .orderBy(desc(transactions.createdAt))
        .limit(15),

      // Query 2: Timeline Data (Lightweight fetch for Summary & Line Charts)
      db
        .select({
          amount: transactions.amount,
          createdAt: transactions.createdAt,
        })
        .from(transactions)
        .where(successWhereClause),

      // Query 3: Fund Frequency Data (Lightweight fetch for Stacked Bar & Fund Count)
      db
        .select({
          fundId: transactionItems.fundId,
          fundName: funds.name,
          createdAt: transactions.createdAt,
        })
        .from(transactionItems)
        .innerJoin(
          transactions,
          eq(transactionItems.transactionId, transactions.id),
        )
        .innerJoin(funds, eq(transactionItems.fundId, funds.id))
        .where(successWhereClause),
    ])

    // --- Processing: Summary & Timeline (Single Pass) ---

    let totalAmount = 0
    let largestAmount = 0
    let largestAmountDate: Date | null = null
    const monthlyMap = new Map<number, number>()
    const dailyMap = new Map<string, number>()

    for (const t of timelineData) {
      // 1. Summary totals
      totalAmount += t.amount
      if (t.amount > largestAmount) {
        largestAmount = t.amount
        largestAmountDate = t.createdAt
      }

      const tzDate = new TZDate(t.createdAt, clientTz)

      // 2. Monthly Contributions
      const month = tzDate.getMonth() + 1
      monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + t.amount)

      // 3. Daily Map for Cumulative
      const day = tzDate.toISOString().slice(0, 10)
      dailyMap.set(day, (dailyMap.get(day) ?? 0) + t.amount)
    }

    const noOfContributions = timelineData.length
    const averageAmount =
      noOfContributions > 0 ? Math.round(totalAmount / noOfContributions) : 0

    const monthlyContributions = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      totalAmount: centsToRinggit(monthlyMap.get(i + 1) ?? 0),
    }))

    const sortedDays = [...dailyMap.keys()].sort()
    let cumulative = 0
    const cumulativeContributions = sortedDays.map((day) => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      cumulative += dailyMap.get(day)!
      return { day, cumulativeAmount: centsToRinggit(cumulative) }
    })

    // --- Processing: Fund Frequency (Single Pass) ---

    const frequencyMap = new Map<string, number>()
    const allFunds = new Set<string>()
    const uniqueFundIds = new Set<string>()

    for (const item of fundData) {
      uniqueFundIds.add(item.fundId)
      allFunds.add(item.fundName)

      const month = new TZDate(item.createdAt, clientTz).getMonth() + 1
      const key = `${month}:${item.fundName}`
      frequencyMap.set(key, (frequencyMap.get(key) ?? 0) + 1)
    }

    const monthlyContributionsFrequency =
      allFunds.size === 0
        ? []
        : Array.from({ length: 12 }, (_, i) => {
            const month = i + 1
            const entry: { [fund: string]: number; month: number } = { month }
            for (const fund of allFunds) {
              entry[fund] = frequencyMap.get(`${month}:${fund}`) ?? 0
            }
            return entry
          })

    return {
      summary: {
        totalAmount: centsToRinggit(totalAmount),
        noOfContributions,
        averageAmount: centsToRinggit(averageAmount),
        largestAmount: centsToRinggit(largestAmount),
        largestAmountDate,
        totalFundsSupported: uniqueFundIds.size,
      },
      monthlyContributions,
      monthlyContributionsFrequency,
      cumulativeContributions,
      transactions: recentTransactions,
    }
  })
