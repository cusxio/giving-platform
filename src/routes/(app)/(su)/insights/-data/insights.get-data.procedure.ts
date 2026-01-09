import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

import { centsToRinggit } from '#/core/money'
import { dbMiddleware } from '#/server/middleware'

import { InsightsRepository } from './insights.repository'

export const getInsightsData = createServerFn()
  .middleware([dbMiddleware])
  .handler(async ({ context }) => {
    const { db, user } = context

    if (user?.role !== 'su') {
      throw notFound()
    }

    const insightsRepository = new InsightsRepository(db)

    const [summaryResult, weeklyCumulativeTotalsByYearResult] = await db.batch([
      insightsRepository.summaryQuery(),
      insightsRepository.weeklyCumulativeTotalsByYearQuery(),
    ])

    const stats = summaryResult[0]
    const noOfContributions = stats?.noOfContributions ?? 0

    const toPercent = (count: number) =>
      noOfContributions > 0
        ? ((count / noOfContributions) * 100).toFixed(2)
        : '0.00'

    const summary = {
      totalAmount: centsToRinggit(stats?.totalAmount ?? 0),
      noOfContributions,
      averageAmount: centsToRinggit(stats?.averageAmount ?? 0),
      medianAmount: centsToRinggit(stats?.medianAmount ?? 0),
    }

    const weekendWeekday = [
      { period: 'weekend', percent: toPercent(stats?.weekendCount ?? 0) },
      { period: 'weekday', percent: toPercent(stats?.weekdayCount ?? 0) },
    ]

    const userGuest = [
      { createdAs: 'user' as const, percent: toPercent(stats?.userCount ?? 0) },
      {
        createdAs: 'guest' as const,
        percent: toPercent(stats?.guestCount ?? 0),
      },
    ]

    const weeklyCumulativeTotalsByYear = weeklyCumulativeTotalsByYearResult.map(
      (row) => ({
        ...row,
        weeklyAmount: centsToRinggit(row.weeklyAmount),
        cumulativeAmount: centsToRinggit(row.cumulativeAmount),
      }),
    )

    return { summary, weeklyCumulativeTotalsByYear, weekendWeekday, userGuest }
  })
