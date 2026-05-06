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

    const [stats] = summaryResult
    const noOfContributions = stats?.noOfContributions ?? 0

    const toPercent = (count: number) =>
      noOfContributions > 0 ? ((count / noOfContributions) * 100).toFixed(2) : '0.00'

    const summary = {
      averageAmount: centsToRinggit(stats?.averageAmount ?? 0),
      medianAmount: centsToRinggit(stats?.medianAmount ?? 0),
      noOfContributions,
      totalAmount: centsToRinggit(stats?.totalAmount ?? 0),
    }

    const weekendWeekday = [
      { percent: toPercent(stats?.weekendCount ?? 0), period: 'weekend' },
      { percent: toPercent(stats?.weekdayCount ?? 0), period: 'weekday' },
    ]

    const userGuest = [
      { createdAs: 'user' as const, percent: toPercent(stats?.userCount ?? 0) },
      { createdAs: 'guest' as const, percent: toPercent(stats?.guestCount ?? 0) },
    ]

    const weeklyCumulativeTotalsByYear = weeklyCumulativeTotalsByYearResult.map((row) => ({
      cumulativeAmount: centsToRinggit(row.cumulativeAmount),
      week: row.week,
      weeklyAmount: centsToRinggit(row.weeklyAmount),
      year: row.year,
    }))

    return { summary, userGuest, weekendWeekday, weeklyCumulativeTotalsByYear }
  })
