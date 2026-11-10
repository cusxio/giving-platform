import { describe, expect, it } from 'vitest'

import { summarizeInsights } from './insights'

const stats = {
  averageAmount: 8000.75,
  guestCount: 1,
  medianAmount: 6000,
  noOfContributions: 4,
  totalAmount: 32_003,
  userCount: 3,
  weekdayCount: 3,
  weekendCount: 1,
}

describe('insights', () => {
  it('reports the summary in ringgit and each split as a two-decimal percent', () => {
    expect.hasAssertions()

    const insights = summarizeInsights([stats], [])

    expect(insights.summary).toStrictEqual({
      averageAmount: 80.0075,
      medianAmount: 60,
      noOfContributions: 4,
      totalAmount: 320.03,
    })
    expect(insights.weekendWeekday).toStrictEqual([
      { percent: '25.00', period: 'weekend' },
      { percent: '75.00', period: 'weekday' },
    ])
    expect(insights.userGuest).toStrictEqual([
      { createdAs: 'user', percent: '75.00' },
      { createdAs: 'guest', percent: '25.00' },
    ])
  })

  it('converts weekly totals to ringgit and keeps the query order', () => {
    expect.hasAssertions()

    expect(
      summarizeInsights(
        [stats],
        [
          { cumulativeAmount: 5000, week: 1, weeklyAmount: 5000, year: 2025 },
          { cumulativeAmount: 5250, week: 2, weeklyAmount: 250, year: 2025 },
          { cumulativeAmount: 100, week: 1, weeklyAmount: 100, year: 2026 },
        ],
      ).weeklyCumulativeTotalsByYear,
    ).toStrictEqual([
      { cumulativeAmount: 50, week: 1, weeklyAmount: 50, year: 2025 },
      { cumulativeAmount: 52.5, week: 2, weeklyAmount: 2.5, year: 2025 },
      { cumulativeAmount: 1, week: 1, weeklyAmount: 1, year: 2026 },
    ])
  })

  it('reports zeros and 0.00 percent without contributions', () => {
    expect.hasAssertions()

    expect(summarizeInsights([], [])).toStrictEqual({
      summary: { averageAmount: 0, medianAmount: 0, noOfContributions: 0, totalAmount: 0 },
      userGuest: [
        { createdAs: 'user', percent: '0.00' },
        { createdAs: 'guest', percent: '0.00' },
      ],
      weekendWeekday: [
        { percent: '0.00', period: 'weekend' },
        { percent: '0.00', period: 'weekday' },
      ],
      weeklyCumulativeTotalsByYear: [],
    })
  })
})
