import { isNotFound, isRedirect } from '@tanstack/react-router'
import { describe, expect, expectTypeOf, it } from 'vitest'

import { createFakeDb } from '#/server/testing/fake-db'
import { recordingLogger } from '#/server/testing/recording-logger'
import { okValue } from '#/server/testing/result'
import { MEMBER, SU, testContext } from '#/server/testing/test-context'

import type { getInsights, getReports } from './analytics.functions'
import {
  fundTotals,
  insightsSummary,
  weeklyCumulativeTotalsByYear,
} from './analytics.repository.server'
import { getInsightsAction, getReportsAction, loadInsights, loadReport } from './analytics.server'
import type { Insights } from './insights'

const weekly = () => [{ cumulativeAmount: 1500, week: 1, weeklyAmount: 1500, year: 2025 }]
const range = {
  endExclusive: new Date('2025-02-01T16:00:00Z'),
  start: new Date('2025-01-01T16:00:00Z'),
}
const tithe = () => [{ createdAs: 'user' as const, fundName: 'Tithe', totalAmount: 12_345 }]

describe('the insights', () => {
  it('read the summary and the weekly totals in one round trip', async () => {
    expect.hasAssertions()

    const db = createFakeDb()
      .on(insightsSummary, () => [])
      .on(weeklyCumulativeTotalsByYear, weekly)

    const insights = okValue(await loadInsights({ db }))

    expect(insights.summary.noOfContributions).toBe(0)
    expect(insights.weeklyCumulativeTotalsByYear).toStrictEqual([
      { cumulativeAmount: 15, week: 1, weeklyAmount: 15, year: 2025 },
    ])
    expect(db.roundTrips).toStrictEqual([
      [insightsSummary.queryName, weeklyCumulativeTotalsByYear.queryName],
    ])
  })

  it('answer only a super user', async () => {
    expect.hasAssertions()

    const db = createFakeDb()
      .on(insightsSummary, () => [])
      .on(weeklyCumulativeTotalsByYear, weekly)

    const insights = await getInsightsAction({ context: testContext(SU, { db }) })
    const member = await getInsightsAction({ context: testContext(MEMBER, { db }) }).catch(
      (error: unknown) => error,
    )
    const guest = await getInsightsAction({ context: testContext(null, { db }) }).catch(
      (error: unknown) => error,
    )

    expectTypeOf<Awaited<ReturnType<typeof getInsights>>>().toEqualTypeOf<Insights>()
    expect(insights.summary.noOfContributions).toBe(0)
    expect(isNotFound(member)).toBe(true)
    expect(isRedirect(guest)).toBe(true)
    expect(guest).toMatchObject({ options: { to: '/auth/login' } })
    expect(db.roundTrips).toHaveLength(1)
  })

  it('log a failed read and answer a generic error', async () => {
    expect.hasAssertions()

    const { events, logger } = recordingLogger()
    const db = createFakeDb()
      .on(insightsSummary, () => {
        throw new Error('relation "transactions" does not exist')
      })
      .on(weeklyCumulativeTotalsByYear, weekly)

    await expect(getInsightsAction({ context: testContext(SU, { db, logger }) })).rejects.toThrow(
      new Error('Internal Server Error'),
    )
    expect(events).toMatchObject([
      {
        event: 'analytics.insights.failed',
        op: `${insightsSummary.queryName} + ${weeklyCumulativeTotalsByYear.queryName}`,
      },
    ])
  })
})

describe('a report', () => {
  it('totals each fund over the range in ringgit', async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(fundTotals, tithe)

    expect(okValue(await loadReport({ db }, range))).toStrictEqual([
      { createdAs: 'user', fundName: 'Tithe', totalAmount: 123.45 },
    ])
    expect(db.calls).toStrictEqual([{ args: [range], name: fundTotals.queryName }])
  })

  it('reads the range a super user asked for', async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(fundTotals, tithe)
    const data = { endDateUTCExclusive: range.endExclusive, startDateUTC: range.start }
    expectTypeOf<Awaited<ReturnType<typeof getReports>>>().toEqualTypeOf<
      { createdAs: 'guest' | 'user'; fundName: string; totalAmount: number }[]
    >()

    await expect(
      getReportsAction({ context: testContext(SU, { db }), data }),
    ).resolves.toStrictEqual([{ createdAs: 'user', fundName: 'Tithe', totalAmount: 123.45 }])
    expect(db.calls).toStrictEqual([{ args: [range], name: fundTotals.queryName }])
  })

  it('refuses a range that is not two dates, without reading', async () => {
    expect.hasAssertions()

    const { events, logger } = recordingLogger()
    const db = createFakeDb().on(fundTotals, tithe)
    const data = { endDateUTCExclusive: new Date('nope'), startDateUTC: '2025-01-01' }

    await expect(
      getReportsAction({ context: testContext(SU, { db, logger }), data }),
    ).rejects.toThrow(new Error('Invalid input'))
    expect(events).toMatchObject([
      {
        event: 'analytics.reports.validation_failed',
        issues: [{ message: 'must be a valid date', path: '/endDateUTCExclusive' }],
      },
    ])
    expect(db.calls).toStrictEqual([])
  })
})
