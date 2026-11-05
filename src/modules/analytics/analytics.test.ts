import { describe, expect, it } from 'vitest'

import { createFakeDb } from '#/server/testing/fake-db'

import {
  fundTotals,
  insightsSummary,
  weeklyCumulativeTotalsByYear,
} from './analytics.repository.server'
import { loadInsights, loadReport } from './analytics.server'

describe('the insights', () => {
  it('read the summary and the weekly totals in one round trip', async () => {
    expect.hasAssertions()

    const db = createFakeDb()
      .on(insightsSummary, () => [])
      .on(weeklyCumulativeTotalsByYear, () => [
        { cumulativeAmount: 1500, week: 1, weeklyAmount: 1500, year: 2025 },
      ])

    const insights = await loadInsights({ db })

    expect(insights.summary.noOfContributions).toBe(0)
    expect(insights.weeklyCumulativeTotalsByYear).toStrictEqual([
      { cumulativeAmount: 15, week: 1, weeklyAmount: 15, year: 2025 },
    ])
    expect(db.roundTrips).toStrictEqual([
      [insightsSummary.queryName, weeklyCumulativeTotalsByYear.queryName],
    ])
  })
})

describe('a report', () => {
  it('totals each fund over the range in ringgit', async () => {
    expect.hasAssertions()

    const range = {
      endExclusive: new Date('2025-02-01T16:00:00Z'),
      start: new Date('2025-01-01T16:00:00Z'),
    }
    const db = createFakeDb().on(fundTotals, () => [
      { createdAs: 'user', fundName: 'Tithe', totalAmount: 12_345 },
    ])

    await expect(loadReport({ db }, range)).resolves.toStrictEqual([
      { createdAs: 'user', fundName: 'Tithe', totalAmount: 123.45 },
    ])
    expect(db.calls).toStrictEqual([{ args: [range], name: fundTotals.queryName }])
  })
})
