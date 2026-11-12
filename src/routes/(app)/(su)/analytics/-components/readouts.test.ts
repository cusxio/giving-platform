import { describe, expect, it, vi } from 'vitest'

import type { Analytics } from '#/modules/analytics'

import {
  changeText,
  growthText,
  monthText,
  monthsOf,
  rangeText,
  rateChangeText,
  rateText,
  shareText,
  weekStartText,
  yearChangeText,
} from './format'
import { fundsCsv, fundsCsvName } from './funds-csv'
import { runningTakeaway, weeklyTakeaway } from './pace-summary'
import { shownYears, yearColor } from './pace-view'

describe('a gave-again rate', () => {
  it('reads as a percentage over ten donors or more, with its counts', () => {
    expect.hasAssertions()

    expect(rateText({ gaveAgain: 24, of: 78 })).toStrictEqual({
      detail: '24 of 78',
      main: '31%',
      share: 24 / 78,
    })
  })

  it('reads as a count under ten donors, so 2 of 3 never reads as 67%', () => {
    expect.hasAssertions()

    expect(rateText({ gaveAgain: 2, of: 3 })).toStrictEqual({
      detail: '',
      main: '2 of 3',
      share: 2 / 3,
    })
    expect(shareText(2, 9)).toBeNull()
    expect(shareText(5, 10)).toBe('50%')
  })

  it('reads as a dash without enough history, not as 0%', () => {
    expect.hasAssertions()

    expect(rateText(null)).toStrictEqual({
      detail: 'Needs two years of history',
      main: '—',
      share: 0,
    })
    expect(rateChangeText(null, { gaveAgain: 5, of: 10 })).toStrictEqual({
      text: '—',
      tone: 'flat',
    })
  })

  it('moves in percentage points against last year', () => {
    expect.hasAssertions()

    expect(rateChangeText({ gaveAgain: 72, of: 100 }, { gaveAgain: 70, of: 100 })).toStrictEqual({
      text: '▲ 2 pts',
      tone: 'up',
    })
    expect(rateChangeText({ gaveAgain: 7, of: 9 }, { gaveAgain: 5, of: 10 })).toStrictEqual({
      text: '—',
      tone: 'flat',
    })
  })
})

describe('a change against last year', () => {
  it.each([
    [108.2, 100, { text: '▲ 8.2%', tone: 'up' }],
    [82, 100, { text: '▼ 18.0%', tone: 'down' }],
    [100, 100, { text: 'Same as last year', tone: 'flat' }],
    [5, 0, { text: 'None last year', tone: 'up' }],
    [0, 0, { text: 'None either year', tone: 'flat' }],
  ])('reads %d against %d as %o', (value, prior, expected) => {
    expect.hasAssertions()

    expect(changeText(value, prior)).toStrictEqual(expected)
  })
})

describe("a year's change", () => {
  it('reads against its prior, or names a first year or first full year', () => {
    expect.hasAssertions()

    expect(yearChangeText(108.2, { kind: 'against', prior: 100 })).toStrictEqual({
      text: '▲ 8.2%',
      tone: 'up',
    })
    expect(yearChangeText(500, { kind: 'first-year' })).toStrictEqual({
      text: 'First year',
      tone: 'flat',
    })
    expect(yearChangeText(500, { kind: 'first-full-year' })).toStrictEqual({
      text: 'First full year',
      tone: 'flat',
    })
  })

  it.each([
    [0.124, '+12%'],
    [-0.05, '−5%'],
    [0.001, '0%'],
  ])('grows %d a year, read as %s', (rate, text) => {
    expect.hasAssertions()

    expect(growthText(rate)).toBe(text)
  })
})

describe('the months of a period', () => {
  it('runs from its first month to its last, across a year end', () => {
    expect.hasAssertions()

    expect(monthsOf({ end: '2026-02-10', start: '2025-11-20' })).toStrictEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ])
  })
})

describe('the days of a period', () => {
  it.each(['UTC', 'America/Los_Angeles', 'Asia/Kuala_Lumpur', 'Pacific/Kiritimati'])(
    'read as the same Kuala Lumpur days on a host in %s',
    (hostTz) => {
      expect.hasAssertions()

      vi.stubEnv('TZ', hostTz)
      try {
        expect(rangeText({ end: '2026-11-10', start: '2026-01-01' })).toBe('1 Jan to 10 Nov 2026')
        expect(rangeText({ end: '2026-03-08', start: '2025-12-31' })).toBe(
          '31 Dec 2025 to 8 Mar 2026',
        )
        expect(monthText('2026-03', false)).toBe('Mar')
        expect(monthText('2025-12', true)).toBe('Dec 25')
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )

  it.each(['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati'])(
    'start each week on the same Kuala Lumpur day on a host in %s',
    (hostTz) => {
      expect.hasAssertions()

      vi.stubEnv('TZ', hostTz)
      try {
        expect(weekStartText(2026, 1)).toBe('1 Jan')
        expect(weekStartText(2026, 45)).toBe('5 Nov')
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )
})

const FUNDS: Analytics['funds'] = [
  { amount: 1234.5, fundName: 'Tithe', gifts: 12, guest: 34.5, prior: 1000, signedIn: 1200 },
  { amount: 0, fundName: 'Building, "new"', gifts: 0, guest: 0, prior: 75, signedIn: 0 },
]

describe('the funds CSV', () => {
  it('holds the funds table, quoting a field with a comma or quote', () => {
    expect.hasAssertions()

    expect(fundsCsv(FUNDS)).toBe(
      [
        'Fund,Received (RM),Same days last year (RM),Gifts,Signed in (RM),Guest (RM)',
        'Tithe,1234.50,1000.00,12,1200.00,34.50',
        '"Building, ""new""",0.00,75.00,0,0.00,0.00',
        '',
      ].join('\r\n'),
    )
    expect(fundsCsvName({ end: '2026-11-10', start: '2026-01-01' })).toBe(
      'funds-2026-01-01-to-2026-11-10.csv',
    )
  })
})

describe('the pace summary', () => {
  const points = [
    { cumulative: 100, week: 10, year: 2025 },
    { cumulative: 200, week: 20, year: 2025 },
    { cumulative: 400, week: 53, year: 2025 },
    { cumulative: 150, week: 12, year: 2026 },
    { cumulative: 220, week: 19, year: 2026 },
  ]

  it('compares this year with last year at the same week and projects the year', () => {
    expect.hasAssertions()

    expect(runningTakeaway({ lastWeek: 20, points }, 2026)).toBe(
      '2026 is 10% ahead of 2025 at this point. At this pace it ends near RM\u00A0440.',
    )
  })

  it('says when this year is ahead of every earlier year too', () => {
    expect.hasAssertions()

    const older = [
      { cumulative: 210, week: 20, year: 2023 },
      { cumulative: 150, week: 20, year: 2024 },
    ]

    expect(runningTakeaway({ lastWeek: 20, points: [...older, ...points] }, 2026)).toBe(
      '2026 is 10% ahead of 2025 at this point, and ahead of every earlier year. At this pace it ends near RM\u00A0440.',
    )
    expect(
      runningTakeaway(
        { lastWeek: 20, points: [{ cumulative: 230, week: 20, year: 2023 }, ...points] },
        2026,
      ),
    ).toBe('2026 is 10% ahead of 2025 at this point. At this pace it ends near RM\u00A0440.')
  })

  it('reads each year at the latest week on or before, whatever order the points come in', () => {
    expect.hasAssertions()

    const outOfOrder = [
      { cumulative: 220, week: 19, year: 2026 },
      { cumulative: 400, week: 53, year: 2025 },
      { cumulative: 200, week: 20, year: 2025 },
      { cumulative: 150, week: 12, year: 2026 },
      { cumulative: 100, week: 10, year: 2025 },
    ]

    expect(runningTakeaway({ lastWeek: 20, points: outOfOrder }, 2026)).toBe(
      runningTakeaway({ lastWeek: 20, points }, 2026),
    )
  })

  it('has nothing to compare without last year', () => {
    expect.hasAssertions()

    const general = 'Running total from 1 January, one line per year.'

    expect(runningTakeaway({ lastWeek: 20, points: points.slice(3) }, 2026)).toBe(general)
    expect(runningTakeaway({ lastWeek: 20, points: [] }, 2026)).toBe(general)
  })
})

describe('the weekly takeaway', () => {
  const points = [
    { cumulative: 0, week: 1, weekly: 100, year: 2025 },
    { cumulative: 0, week: 14, weekly: 900.4, year: 2025 },
    { cumulative: 0, week: 2, weekly: 2000, year: 2026 },
  ]

  it("names the picked year's biggest week, against the other year shown", () => {
    expect.hasAssertions()

    expect(weeklyTakeaway(points, [2025, 2026], 2025)).toBe(
      'Each week of 2025 against 2026. Its biggest week began 2 Apr, with RM\u00A0900.',
    )
    expect(weeklyTakeaway(points, [2024], 2024)).toBe('Each week of 2024.')
  })
})

describe('the pace chart years', () => {
  const years = [2022, 2023, 2024, 2025, 2026]

  it('shows every year as a running total, and two years each week', () => {
    expect.hasAssertions()

    expect(shownYears(years, { measure: 'cumulative', picked: 2024, thisYear: 2026 })).toBe(years)
    expect(shownYears(years, { measure: 'weekly', picked: 2024, thisYear: 2026 })).toStrictEqual([
      2023, 2024,
    ])
    expect(shownYears(years, { measure: 'weekly', picked: 2022, thisYear: 2026 })).toStrictEqual([
      2022, 2023,
    ])
    expect(shownYears([2026], { measure: 'weekly', picked: 2026, thisYear: 2026 })).toStrictEqual([
      2026,
    ])
  })

  const running = { measure: 'cumulative', picked: 2023, thisYear: 2026 } as const

  it('keeps this year bright, picks out another year, and fades older years', () => {
    expect.hasAssertions()

    expect(yearColor(2026, running)).toBe('var(--color-chart-1)')
    expect(yearColor(2023, running)).toBe('var(--color-chart-2)')
    expect(yearColor(2025, running)).toBe(
      'color-mix(in oklab, var(--color-fg-muted) 85%, transparent)',
    )
    expect(yearColor(2018, running)).toBe(
      'color-mix(in oklab, var(--color-fg-muted) 20%, transparent)',
    )
  })

  it('draws the picked year bright each week, and the other year muted', () => {
    expect.hasAssertions()

    expect(yearColor(2023, { ...running, measure: 'weekly' })).toBe('var(--color-chart-1)')
    expect(yearColor(2026, { ...running, measure: 'weekly' })).toBe('var(--color-fg-subtle)')
  })
})
