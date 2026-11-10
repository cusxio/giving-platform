import { describe, expect, it } from 'vitest'

import { getYearDateRange, summarizeOverview } from './overview'

// Kuala Lumpur is UTC+8, so 16:30Z on 31 January is already 1 February there.
const FEB_1_KL_EARLY = new Date('2025-01-31T16:30:00Z')
const JAN_31_KL_LATE = new Date('2025-01-31T15:00:00Z')
const FEB_1_KL_MORNING = new Date('2025-02-01T02:00:00Z')
const JAN_1_2026_KL = new Date('2025-12-31T20:00:00Z')

const recent = [
  { amount: 5000, createdAt: FEB_1_KL_EARLY, id: 'txn_1', status: 'success' as const },
  { amount: 700, createdAt: JAN_31_KL_LATE, id: 'txn_2', status: 'failed' as const },
]

const timeline = [
  { amount: 5000, createdAt: FEB_1_KL_EARLY },
  { amount: 12_000, createdAt: JAN_31_KL_LATE },
  { amount: 3003, createdAt: FEB_1_KL_MORNING },
  { amount: 12_000, createdAt: JAN_1_2026_KL },
]

const fundItems = [
  { createdAt: FEB_1_KL_EARLY, fundId: 'fund_tithe', fundName: 'Tithe' },
  { createdAt: JAN_31_KL_LATE, fundId: 'fund_tithe', fundName: 'Tithe' },
  { createdAt: JAN_31_KL_LATE, fundId: 'fund_missions', fundName: 'Missions' },
  { createdAt: FEB_1_KL_MORNING, fundId: 'fund_missions', fundName: 'Missions' },
  { createdAt: FEB_1_KL_EARLY, fundId: 'fund_missions', fundName: 'Missions' },
]

const months = Array.from({ length: 12 }, (_, i) => i + 1)

/** Twelve monthly values, zero except where `values` sets one. */
const perMonth = (values: Record<number, number>) => months.map((month) => values[month] ?? 0)

describe('overview summary', () => {
  it('summarizes successful contributions in ringgit', () => {
    expect.hasAssertions()

    const { summary } = summarizeOverview(recent, timeline, fundItems)

    expect(summary).toStrictEqual({
      // 32003 cents over 4 contributions rounds up to 8001 cents.
      averageAmount: 80.01,
      largestAmount: 120,
      // The first of two equal largest amounts wins.
      largestAmountDate: JAN_31_KL_LATE,
      noOfContributions: 4,
      totalAmount: 320.03,
      totalFundsSupported: 2,
    })
  })

  it('buckets monthly totals by the Kuala Lumpur month', () => {
    expect.hasAssertions()

    const { monthlyContributions } = summarizeOverview(recent, timeline, fundItems)

    expect(monthlyContributions).toStrictEqual(
      perMonth({ 1: 240, 2: 80.03 }).map((totalAmount, i) => ({ month: i + 1, totalAmount })),
    )
  })

  it('accumulates totals per Kuala Lumpur day in date order', () => {
    expect.hasAssertions()

    const { cumulativeContributions } = summarizeOverview(recent, timeline, fundItems)

    expect(cumulativeContributions).toStrictEqual([
      { cumulativeAmount: 120, day: '2025-01-31' },
      { cumulativeAmount: 200.03, day: '2025-02-01' },
      { cumulativeAmount: 320.03, day: '2026-01-01' },
    ])
  })

  it('counts fund items per month for every fund seen', () => {
    expect.hasAssertions()

    const { monthlyContributionsFrequency } = summarizeOverview(recent, timeline, fundItems)
    const missions = perMonth({ 1: 1, 2: 2 })
    const tithe = perMonth({ 1: 1, 2: 1 })

    expect(monthlyContributionsFrequency).toStrictEqual(
      months.map((month, i) => ({ Missions: missions[i], Tithe: tithe[i], month })),
    )
  })

  it('passes the recent transactions through unchanged', () => {
    expect.hasAssertions()

    expect(summarizeOverview(recent, timeline, fundItems).transactions).toStrictEqual(recent)
  })

  it('returns zeroed charts and no fund frequency without contributions', () => {
    expect.hasAssertions()

    expect(summarizeOverview([], [], [])).toStrictEqual({
      cumulativeContributions: [],
      monthlyContributions: months.map((month) => ({ month, totalAmount: 0 })),
      monthlyContributionsFrequency: [],
      summary: {
        averageAmount: 0,
        largestAmount: 0,
        largestAmountDate: null,
        noOfContributions: 0,
        totalAmount: 0,
        totalFundsSupported: 0,
      },
      transactions: [],
    })
  })
})

describe('overview year range', () => {
  it('leaves the range open for all years', () => {
    expect.hasAssertions()

    expect(getYearDateRange('all')).toStrictEqual({
      endDateUTCExclusive: undefined,
      startDateUTC: undefined,
    })
  })

  it('spans the Kuala Lumpur calendar year in UTC', () => {
    expect.hasAssertions()

    expect(getYearDateRange(2025)).toStrictEqual({
      endDateUTCExclusive: new Date('2025-12-31T16:00:00Z'),
      startDateUTC: new Date('2024-12-31T16:00:00Z'),
    })
  })
})
