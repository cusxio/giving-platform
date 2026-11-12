import { describe, expect, it } from 'vitest'

import type { EveryYearReads } from './every-year'
import { sameDaysLastYear, toEveryYear } from './every-year'

const TODAY = '2026-11-10'

const year = (value: number, received: number, firstDay = `${value}-01-02`) => ({
  donors: 10,
  firstDay,
  gifts: received / 1000,
  median: 5000,
  received,
  year: value,
})

const reads = (years: EveryYearReads['years'], sameDays = 0): EveryYearReads => ({
  sameDaysLastYear: { received: sameDays },
  weeks: [],
  years,
})

const changes = (everyYear: ReturnType<typeof toEveryYear>) =>
  everyYear.years.map((row) => [row.year, row.change])

describe('every year of giving', () => {
  it('lists years newest first, this year against the same days last year', () => {
    expect.hasAssertions()

    const everyYear = toEveryYear(
      TODAY,
      reads(
        [year(2023, 100_000), year(2024, 200_000), year(2025, 400_000), year(2026, 330_000)],
        300_000,
      ),
    )

    expect(changes(everyYear)).toStrictEqual([
      [2026, { kind: 'against', prior: 3000 }],
      [2025, { kind: 'against', prior: 2000 }],
      [2024, { kind: 'against', prior: 1000 }],
      [2023, { kind: 'first-year' }],
    ])
    expect(everyYear.years[0]).toStrictEqual({
      change: { kind: 'against', prior: 3000 },
      donors: 10,
      gifts: 330,
      median: 50,
      received: 3300,
      year: 2026,
    })
  })

  it('sums every year and finds the best full year and the growth per year', () => {
    expect.hasAssertions()

    const everyYear = toEveryYear(
      TODAY,
      reads(
        [year(2023, 100_000), year(2024, 200_000), year(2025, 400_000), year(2026, 900_000)],
        300_000,
      ),
    )

    expect(everyYear.firstYear).toBe(2023)
    expect(everyYear.year).toBe(2026)
    expect(everyYear.kpis).toStrictEqual({
      bestFullYear: { received: 4000, year: 2025 },
      growth: { from: 2023, rate: 1, to: 2025 },
      received: { gifts: 1600, received: 16_000 },
      thisYear: { change: { kind: 'against', prior: 3000 }, received: 9000 },
    })
  })

  it('calls the year after a late first year its first full year, and leaves the first out', () => {
    expect.hasAssertions()

    const everyYear = toEveryYear(
      TODAY,
      reads([year(2023, 900_000, '2023-06-15'), year(2024, 100_000), year(2025, 121_000)]),
    )

    expect(changes(everyYear)).toStrictEqual([
      [2025, { kind: 'against', prior: 1000 }],
      [2024, { kind: 'first-full-year' }],
      [2023, { kind: 'first-year' }],
    ])
    expect(everyYear.kpis.bestFullYear).toStrictEqual({ received: 1210, year: 2025 })
    expect(everyYear.kpis.growth?.rate).toBeCloseTo(0.21)
  })

  it('counts a first year that began in its first week as full', () => {
    expect.hasAssertions()

    const everyYear = toEveryYear(
      TODAY,
      reads([year(2024, 100_000, '2024-01-07'), year(2025, 150_000)]),
    )

    expect(changes(everyYear)[0]).toStrictEqual([2025, { kind: 'against', prior: 1000 }])
    expect(everyYear.kpis.growth).toStrictEqual({ from: 2024, rate: 0.5, to: 2025 })
  })

  it('has no growth under two full years, and no best year without a full one', () => {
    expect.hasAssertions()

    const one = toEveryYear(TODAY, reads([year(2025, 100_000), year(2026, 50_000)]))
    const late = toEveryYear(TODAY, reads([year(2025, 100_000, '2025-03-01'), year(2026, 50_000)]))

    expect(one.kpis.growth).toBeNull()
    expect(one.kpis.bestFullYear).toStrictEqual({ received: 1000, year: 2025 })
    expect(late.kpis.growth).toBeNull()
    expect(late.kpis.bestFullYear).toBeNull()
    expect(late.kpis.thisYear.change).toStrictEqual({ kind: 'first-full-year' })
  })

  it('compares a year after a year with no gifts against nothing', () => {
    expect.hasAssertions()

    const everyYear = toEveryYear(TODAY, reads([year(2022, 100_000), year(2024, 200_000)]))

    expect(changes(everyYear)[0]).toStrictEqual([2024, { kind: 'against', prior: 0 }])
  })

  it('reads this year as the first, before any gift', () => {
    expect.hasAssertions()

    const empty = toEveryYear(TODAY, { sameDaysLastYear: null, weeks: [], years: [] })

    expect(empty).toStrictEqual({
      firstYear: 2026,
      kpis: {
        bestFullYear: null,
        growth: null,
        received: { gifts: 0, received: 0 },
        thisYear: { change: { kind: 'first-year' }, received: 0 },
      },
      pace: { lastWeek: 45, points: [] },
      year: 2026,
      years: [],
    })
  })

  it("folds a year's last one or two days into week 52", () => {
    expect.hasAssertions()

    const everyYear = toEveryYear('2026-12-31', {
      sameDaysLastYear: null,
      weeks: [
        { cumulative: 100_000, week: 52, weeklyAmount: 10_000, year: 2025 },
        { cumulative: 102_000, week: 53, weeklyAmount: 2000, year: 2025 },
        { cumulative: 5000, week: 1, weeklyAmount: 5000, year: 2026 },
      ],
      years: [],
    })

    expect(everyYear.pace).toStrictEqual({
      lastWeek: 52,
      points: [
        { cumulative: 1020, week: 52, weekly: 120, year: 2025 },
        { cumulative: 50, week: 1, weekly: 50, year: 2026 },
      ],
    })
  })
})

describe('the same days last year', () => {
  it.each([
    ['2026-11-10', { end: '2025-11-10', start: '2025-01-01' }],
    ['2028-02-29', { end: '2027-02-28', start: '2027-01-01' }],
    ['2026-01-01', { end: '2025-01-01', start: '2025-01-01' }],
  ])('run from 1 January to %s a year back', (today, range) => {
    expect.hasAssertions()

    expect(sameDaysLastYear(today)).toStrictEqual(range)
  })
})
