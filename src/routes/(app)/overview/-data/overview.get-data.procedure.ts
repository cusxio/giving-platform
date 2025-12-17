import { createServerFn } from '@tanstack/react-start'
import { and, eq, gte, inArray, lt } from 'drizzle-orm'

import { getTzOffsetModifier } from '#/core/date'
import { centsToRinggit } from '#/core/money'
import type { User } from '#/db/schema'
import { transactions } from '#/db/schema'
import { dbMiddleware } from '#/server/middleware'

import {
  formatContributionStats,
  formatLargestTransactionDate,
  formatTotalFundsSupported,
  getYearDateRange,
  zeroFillMonthlyContributionsData,
  zeroFillMonthlyFrequencyData,
} from './overview.helpers'
import { OverviewRepository } from './overview.repository'

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
    const { db } = context
    const { userId, year, journey } = data

    const { startDateUTC, endDateUTCExclusive } = getYearDateRange(year)

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

    const whereClause = and(...conditions, eq(transactions.status, 'success'))
    const transactionsWhereClause = and(
      ...conditions,
      inArray(transactions.status, ['success', 'failed']),
    )

    const modifier = getTzOffsetModifier()
    const overviewRepository = new OverviewRepository(db)

    const [
      contributionStatsResult,
      totalFundsSupportedResult,
      largestTransactionDateResult,
      monthlyContributionsResult,
      monthlyContributionsFrequencyResult,
      cumulativeContributionsResult,
      transactionsResult,
    ] = await db.batch([
      overviewRepository.contributionStatsQuery(whereClause),
      overviewRepository.getTotalFundsSupported(whereClause),
      overviewRepository.largestTransactionDateQuery(whereClause),
      overviewRepository.contributionsPerMonthQuery(whereClause, modifier),
      overviewRepository.contributionsFrequencyPerMonthQuery(
        whereClause,
        modifier,
      ),
      overviewRepository.cumulativeContributionsQuery(whereClause, modifier),
      overviewRepository.getTransactionsQuery(transactionsWhereClause),
    ])

    return {
      summary: {
        ...formatContributionStats(contributionStatsResult[0]),
        ...formatLargestTransactionDate(largestTransactionDateResult[0]),
        ...formatTotalFundsSupported(totalFundsSupportedResult[0]),
      },
      monthlyContributions: zeroFillMonthlyContributionsData(
        monthlyContributionsResult,
      ),
      monthlyContributionsFrequency: zeroFillMonthlyFrequencyData(
        monthlyContributionsFrequencyResult,
      ),
      cumulativeContributions: cumulativeContributionsResult.map((entry) => ({
        ...entry,
        cumulativeAmount: centsToRinggit(entry.cumulativeAmount),
      })),
      transactions: transactionsResult,
    }
  })
