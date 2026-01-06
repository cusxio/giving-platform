import { createServerFn } from '@tanstack/react-start'

import { centsToRinggit } from '#/core/money'
import { dbMiddleware } from '#/server/middleware'

import { formatTransactionSummary } from './insights.helpers'
import { InsightsRepository } from './insights.repository'

export const getInsightsData = createServerFn()
  .middleware([dbMiddleware])
  .handler(async ({ context }) => {
    const { db } = context

    const insightsRepository = new InsightsRepository(db)

    const [
      transactionSummaryResult,
      weekendWeekdayTransactionCountResult,
      userGuestTransactionCountResult,
      weeklyCumulativeTotalsByYearResult,
    ] = await db.batch([
      insightsRepository.transactionSummaryQuery(),
      insightsRepository.weekendWeekdayTransactionCountQuery(),
      insightsRepository.userGuestTransanctionCountQuery(),
      insightsRepository.weeklyCumulativeTotalsByYearQuery(),
    ])

    const summary = formatTransactionSummary(transactionSummaryResult[0])

    const weekendWeekday = weekendWeekdayTransactionCountResult.map((x) => ({
      period: x.period,
      percent: ((x.count / summary.noOfContributions) * 100).toFixed(2),
    }))

    const userGuest = userGuestTransactionCountResult.map((x) => ({
      createdAs: x.createdAs,
      percent: ((x.count / summary.noOfContributions) * 100).toFixed(2),
    }))

    const weeklyCumulativeTotalsByYear = weeklyCumulativeTotalsByYearResult.map(
      (row) => ({
        ...row,
        weeklyAmount: centsToRinggit(row.weeklyAmount),
        cumulativeAmount: centsToRinggit(row.cumulativeAmount),
      }),
    )

    return { summary, weeklyCumulativeTotalsByYear, weekendWeekday, userGuest }
  })
