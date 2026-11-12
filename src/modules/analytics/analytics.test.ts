import { isNotFound, isRedirect } from '@tanstack/react-router'
import { describe, expect, expectTypeOf, it } from 'vitest'

import { countStalePending } from '#/modules/payments/server'
import { createDriverDb } from '#/server/testing/driver-db'
import { createFakeDb } from '#/server/testing/fake-db'
import { recordingLogger } from '#/server/testing/recording-logger'
import { errValue, okValue } from '#/server/testing/result'
import { MEMBER, SU, testContext } from '#/server/testing/test-context'

import type { getAnalytics, getEveryYear } from './analytics.functions'
import {
  countHeld,
  donorWindows,
  fundTotals,
  giftSizeBands,
  givingHeatmap,
  monthlyByFund,
  paymentMethodOutcomes,
  periodTotals,
  weeklyTotalsByYear,
  yearTotals,
} from './analytics.repository.server'
import { getAnalyticsAction, loadAnalytics } from './analytics.server'
import type { Analytics, EveryYear } from './analytics.types'
import { getEveryYearAction, loadEveryYear } from './every-year.server'
import { GIFT_BAND_BOUNDS } from './gift-bands'
import { resolvePeriod, spanOf, weekOfYear, windowsOf } from './period'

const TODAY = '2026-11-10'
const period = resolvePeriod({}, TODAY)
const windows = windowsOf(period)

const totals = (received: number) => ({
  donors: 2,
  gifts: 3,
  guestAmount: 1000,
  guestGifts: 1,
  median: 5050,
  received,
  userAmount: received - 1000,
  userGifts: 2,
})

const isPeriod = (span: { readonly start: Date }) =>
  span.start.getTime() === windows.period.start.getTime()

function pageDb() {
  return createFakeDb()
    .on(periodTotals, (span) => (isPeriod(span) ? totals(30_000) : totals(20_000)))
    .on(monthlyByFund, (span) =>
      isPeriod(span)
        ? [{ amount: 12_345, fundName: 'Tithe', month: '2026-01' }]
        : [
            { amount: 5000, fundName: 'Tithe', month: '2025-01' },
            { amount: 2500, fundName: 'Mission', month: '2025-01' },
          ],
    )
    .on(donorWindows, () => [
      {
        compare: 1000,
        firstGiftAt: new Date('2020-01-01T00:00:00Z'),
        last12Months: 5000,
        months12to24: 1000,
        months24to36: 1000,
        monthsGivenLast12: 7,
        period: 5000,
        yearBeforePeriod: 1000,
      },
    ])
    .on(fundTotals, (span) =>
      isPeriod(span)
        ? [{ amount: 20_000, fundName: 'Tithe', gifts: 2, guest: 0, signedIn: 20_000 }]
        : [{ amount: 9000, fundName: 'Mission', gifts: 1, guest: 9000, signedIn: 0 }],
    )
    .on(giftSizeBands, (span) => (isPeriod(span) ? [{ amount: 30_000, bucket: 2, gifts: 3 }] : []))
    .on(givingHeatmap, () => [{ block: 3, gifts: 4, weekday: 7 }])
    .on(paymentMethodOutcomes, () => [{ cancelled: 1, failed: 2, method: 'CC', succeeded: 3 }])
    .on(countHeld, () => 2)
    .on(countStalePending, () => 1)
}

const PAGE_QUERIES = [
  periodTotals.queryName,
  periodTotals.queryName,
  monthlyByFund.queryName,
  monthlyByFund.queryName,
  donorWindows.queryName,
  fundTotals.queryName,
  fundTotals.queryName,
  giftSizeBands.queryName,
  giftSizeBands.queryName,
  givingHeatmap.queryName,
  paymentMethodOutcomes.queryName,
  countHeld.queryName,
  countStalePending.queryName,
]

describe('the analytics workflow', () => {
  it('reads the whole page in one round trip', async () => {
    expect.hasAssertions()

    const db = pageDb()

    okValue(await loadAnalytics({ db }, {}, TODAY))

    expect(db.roundTrips).toStrictEqual([PAGE_QUERIES])
  })

  it('reads the period and the same days last year', async () => {
    expect.hasAssertions()

    const db = pageDb()

    okValue(await loadAnalytics({ db }, {}, TODAY))

    expect(db.calls.slice(0, 2).map((call) => call.args)).toStrictEqual([
      [spanOf({ end: '2026-11-10', start: '2026-01-01' })],
      [spanOf({ end: '2025-11-10', start: '2025-01-01' })],
    ])
    expect(db.calls[7]?.args).toStrictEqual([windows.period, GIFT_BAND_BOUNDS])
  })

  it('answers in ringgit, with each figure beside last year', async () => {
    expect.hasAssertions()

    const analytics = okValue(await loadAnalytics({ db: pageDb() }, {}, TODAY))

    expect(analytics.period).toStrictEqual(period.period)
    expect(analytics.compare).toStrictEqual(period.compare)
    expect(analytics.kpis).toStrictEqual({
      donors: { prior: 2, value: 2 },
      gaveAgain: { prior: { gaveAgain: 1, of: 1 }, value: { gaveAgain: 1, of: 1 } },
      gifts: { prior: 3, value: 3 },
      medianGift: { prior: 50.5, value: 50.5 },
      received: { prior: 200, value: 300 },
    })
    expect(analytics.signedInGuest).toStrictEqual({
      guest: { amount: 10, gifts: 1 },
      user: { amount: 290, gifts: 2 },
    })
    expect(analytics.attention).toStrictEqual({ held: 2, stalePending: 1 })
  })

  it("lines last year's months up with this year's", async () => {
    expect.hasAssertions()

    const analytics = okValue(await loadAnalytics({ db: pageDb() }, {}, TODAY))

    expect(analytics.monthly).toStrictEqual([
      { amount: 123.45, fundName: 'Tithe', month: '2026-01' },
    ])
    expect(analytics.monthlyLastYear).toStrictEqual([{ amount: 75, month: '2026-01' }])
  })

  it('lists every fund given to in either span, largest first', async () => {
    expect.hasAssertions()

    const analytics = okValue(await loadAnalytics({ db: pageDb() }, {}, TODAY))

    expect(analytics.funds).toStrictEqual([
      { amount: 200, fundName: 'Tithe', gifts: 2, guest: 0, prior: 0, signedIn: 200 },
      { amount: 0, fundName: 'Mission', gifts: 0, guest: 0, prior: 90, signedIn: 0 },
    ])
  })

  it('fills every weekday and three-hour block', async () => {
    expect.hasAssertions()

    const analytics = okValue(await loadAnalytics({ db: pageDb() }, {}, TODAY))

    expect(analytics.whenPeopleGive).toHaveLength(56)
    expect(analytics.whenPeopleGive[0]).toStrictEqual({ block: 0, gifts: 0, weekday: 1 })
    expect(analytics.whenPeopleGive.filter((cell) => cell.gifts > 0)).toStrictEqual([
      { block: 3, gifts: 4, weekday: 7 },
    ])
  })
})

function everyYearDb() {
  return createFakeDb()
    .on(yearTotals, () => [
      { donors: 3, firstDay: '2025-01-02', gifts: 4, median: 5000, received: 40_000, year: 2025 },
      { donors: 2, firstDay: '2026-01-05', gifts: 3, median: 5050, received: 30_000, year: 2026 },
    ])
    .on(periodTotals, () => totals(25_000))
    .on(weeklyTotalsByYear, () => [
      { cumulative: 40_000, week: 1, weeklyAmount: 40_000, year: 2025 },
      { cumulative: 30_000, week: 2, weeklyAmount: 30_000, year: 2026 },
    ])
}

describe('the every year workflow', () => {
  it('reads every year, the same days last year and every week in one round trip', async () => {
    expect.hasAssertions()

    const db = everyYearDb()

    okValue(await loadEveryYear({ db }, TODAY))

    expect(db.roundTrips).toStrictEqual([
      [yearTotals.queryName, periodTotals.queryName, weeklyTotalsByYear.queryName],
    ])
    expect(db.calls[1]?.args).toStrictEqual([spanOf({ end: '2025-11-10', start: '2025-01-01' })])
  })

  it('answers in ringgit, this year against the same days last year', async () => {
    expect.hasAssertions()

    const everyYear = okValue(await loadEveryYear({ db: everyYearDb() }, TODAY))

    expect(everyYear.kpis.thisYear).toStrictEqual({
      change: { kind: 'against', prior: 250 },
      received: 300,
    })
    expect(everyYear.years.map((row) => [row.year, row.received, row.median])).toStrictEqual([
      [2026, 300, 50.5],
      [2025, 400, 50],
    ])
    expect(everyYear.pace).toStrictEqual({
      lastWeek: 45,
      points: [
        { cumulative: 400, week: 1, weekly: 400, year: 2025 },
        { cumulative: 300, week: 2, weekly: 300, year: 2026 },
      ],
    })
  })
})

const DONOR_KEYS = new Set(['email', 'firstName', 'lastName', 'userId'])

function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => keysOf(item))
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
    return [...entries.map(([key]) => key), ...entries.flatMap(([, inner]) => keysOf(inner))]
  }
  return []
}

type DeepKeys<T> = T extends readonly (infer Item)[]
  ? DeepKeys<Item>
  : T extends object
    ? { [K in keyof T]-?: K | DeepKeys<T[K]> }[keyof T]
    : never

describe('the analytics action', () => {
  it('answers only a super user', async () => {
    expect.hasAssertions()

    const db = pageDb()

    const analytics = await getAnalyticsAction({ context: testContext(SU, { db }), data: {} })
    const member = await getAnalyticsAction({
      context: testContext(MEMBER, { db }),
      data: {},
    }).catch((error: unknown) => error)
    const guest = await getAnalyticsAction({ context: testContext(null, { db }), data: {} }).catch(
      (error: unknown) => error,
    )

    expectTypeOf<Awaited<ReturnType<typeof getAnalytics>>>().toEqualTypeOf<Analytics>()
    expect(analytics.kpis.gifts.value).toBe(3)
    expect(isNotFound(member)).toBe(true)
    expect(isRedirect(guest)).toBe(true)
    expect(guest).toMatchObject({ options: { to: '/auth/login' } })
    expect(db.roundTrips).toHaveLength(1)
  })

  it('names no donor anywhere in its answer, on either tab', async () => {
    expect.hasAssertions()

    const analytics = await getAnalyticsAction({
      context: testContext(SU, { db: pageDb() }),
      data: {},
    })
    const everyYear = await getEveryYearAction({
      context: testContext(SU, { db: everyYearDb() }),
      data: undefined,
    })

    expectTypeOf<
      Extract<DeepKeys<Analytics | EveryYear>, 'email' | 'firstName' | 'lastName' | 'userId'>
    >().toBeNever()
    expect(keysOf(analytics).filter((key) => DONOR_KEYS.has(key))).toStrictEqual([])
    expect(keysOf(analytics)).toContain('segments')
    expect(keysOf(everyYear).filter((key) => DONOR_KEYS.has(key))).toStrictEqual([])
    expect(keysOf(everyYear)).toContain('donors')
  })

  it('refuses a date that is not a calendar day, without reading', async () => {
    expect.hasAssertions()

    const { events, logger } = recordingLogger()
    const db = pageDb()

    await expect(
      getAnalyticsAction({
        context: testContext(SU, { db, logger }),
        data: { end: '2026-02-30', start: '2026-01-01' },
      }),
    ).rejects.toThrow(new Error('Invalid input'))
    expect(events).toMatchObject([
      {
        event: 'analytics.read.validation_failed',
        issues: [{ message: 'must be a date', path: '/end' }],
      },
    ])
    expect(db.calls).toStrictEqual([])
  })

  it('logs a failed read and answers a generic error', async () => {
    expect.hasAssertions()

    const { events, logger } = recordingLogger()
    const db = pageDb().on(countHeld, () => {
      throw new Error('relation "transactions" does not exist')
    })

    await expect(
      getAnalyticsAction({ context: testContext(SU, { db, logger }), data: {} }),
    ).rejects.toThrow(new Error('Internal Server Error'))
    expect(events).toMatchObject([{ event: 'analytics.read.failed', op: PAGE_QUERIES.join(' + ') }])
  })
})

describe('the every year action', () => {
  it('answers only a super user', async () => {
    expect.hasAssertions()

    const db = everyYearDb()

    const everyYear = await getEveryYearAction({
      context: testContext(SU, { db }),
      data: undefined,
    })
    const member = await getEveryYearAction({
      context: testContext(MEMBER, { db }),
      data: undefined,
    }).catch((error: unknown) => error)
    const guest = await getEveryYearAction({
      context: testContext(null, { db }),
      data: undefined,
    }).catch((error: unknown) => error)

    expectTypeOf<Awaited<ReturnType<typeof getEveryYear>>>().toEqualTypeOf<EveryYear>()
    expect(everyYear.kpis.received).toStrictEqual({ gifts: 7, received: 700 })
    expect(isNotFound(member)).toBe(true)
    expect(isRedirect(guest)).toBe(true)
    expect(db.roundTrips).toHaveLength(1)
  })

  it('logs a failed read and answers a generic error', async () => {
    expect.hasAssertions()

    const { events, logger } = recordingLogger()
    const db = everyYearDb().on(weeklyTotalsByYear, () => {
      throw new Error('relation "transactions" does not exist')
    })

    await expect(
      getEveryYearAction({ context: testContext(SU, { db, logger }), data: undefined }),
    ).rejects.toThrow(new Error('Internal Server Error'))
    expect(events).toMatchObject([
      {
        event: 'analytics.every_year.failed',
        op: [yearTotals, periodTotals, weeklyTotalsByYear].map((q) => q.queryName).join(' + '),
      },
    ])
  })
})

async function sqlOf(query: Parameters<ReturnType<typeof createDriverDb>['run']>[0]) {
  const statements: string[] = []
  const db = createDriverDb((sql) => {
    statements.push(sql.replaceAll(/\s+/gu, ' '))
    return Promise.resolve({ rows: [] })
  })
  await db.run(query)
  return statements.join('\n')
}

describe('the analytics statements', () => {
  it('group by exactly the Kuala Lumpur expressions they select', async () => {
    expect.hasAssertions()

    const local = `("transactions"."created_at" AT TIME ZONE 'Asia/Kuala_Lumpur')`
    const weekday = `EXTRACT(ISODOW FROM ${local})::integer`
    const block = `(EXTRACT(HOUR FROM ${local})::integer / 3)`

    await expect(sqlOf(givingHeatmap(windows.period))).resolves.toContain(
      `group by ${weekday}, ${block}`,
    )
    await expect(sqlOf(monthlyByFund(windows.period))).resolves.toContain(
      `group by to_char(${local}, 'YYYY-MM'), "funds"."name"`,
    )
    await expect(sqlOf(yearTotals())).resolves.toContain(
      `group by EXTRACT(YEAR FROM ${local})::integer order by`,
    )
  })

  it('read every year of counted gifts, with no date bounds', async () => {
    expect.hasAssertions()

    for (const sql of [await sqlOf(yearTotals()), await sqlOf(weeklyTotalsByYear())]) {
      expect(sql).toContain('where "transactions"."status" = $1')
      expect(sql).not.toContain('"transactions"."created_at" >=')
    }
  })

  it('bands gift sizes with width_bucket over the bounds it is given', async () => {
    expect.hasAssertions()

    const bucket = `width_bucket("transactions"."amount", ARRAY[5000, 10000, 20000, 50000, 100000]::integer[])`

    await expect(sqlOf(giftSizeBands(windows.period, GIFT_BAND_BOUNDS))).resolves.toContain(
      `group by ${bucket}`,
    )
    const fractional = await createDriverDb(() => Promise.resolve({ rows: [] })).run(
      giftSizeBands(windows.period, [1.5]),
    )
    expect(errValue(fractional).cause).toStrictEqual(
      new Error('gift band bounds must be integers: 1.5'),
    )
  })

  it('groups donors by id without selecting it', async () => {
    expect.hasAssertions()

    const sql = await sqlOf(donorWindows(windows))
    const selected = sql.slice(0, sql.indexOf(' from '))

    expect(selected).not.toContain('user_id')
    expect(sql).toContain('group by "transactions"."user_id"')
  })

  it("reads each transaction's newest payments row", async () => {
    expect.hasAssertions()

    await expect(sqlOf(paymentMethodOutcomes(windows.period))).resolves.toContain(
      'left join lateral (select "payment_method" from "payments" where "payments"."transaction_id" = "transactions"."id" order by "payments"."id" desc limit $',
    )
  })
})

const SQL_WEEK =
  /\(\(EXTRACT\(DOY FROM \("transactions"\."created_at" AT TIME ZONE 'Asia\/Kuala_Lumpur'\)\)::integer - (?<offset>\d+)\) \/ (?<length>\d+) \+ (?<first>\d+)\)/u

async function sqlWeekOfDay() {
  const sql = await sqlOf(weeklyTotalsByYear())
  const week = SQL_WEEK.exec(sql)?.groups
  if (week === undefined) {
    throw new Error(`no week expression in: ${sql}`)
  }
  const offset = Number(week.offset)
  const length = Number(week.length)
  const first = Number(week.first)
  return (dayOfYear: number) => Math.trunc((dayOfYear - offset) / length) + first
}

describe('the week a day falls in', () => {
  it.each([
    ['2026-01-01', 1, 1],
    ['2026-01-02', 2, 1],
    ['2026-01-03', 3, 1],
    ['2026-01-07', 7, 1],
    ['2026-01-08', 8, 2],
    ['2026-12-31', 365, 53],
    ['2024-12-31', 366, 53],
  ])('is the same in SQL and TS for %s, day %i: week %i', async (iso, dayOfYear, week) => {
    expect.hasAssertions()

    const sqlWeek = await sqlWeekOfDay()

    expect(sqlWeek(dayOfYear)).toBe(week)
    expect(weekOfYear(iso)).toBe(week)
  })
})
