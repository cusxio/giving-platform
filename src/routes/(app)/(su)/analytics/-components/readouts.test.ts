import { describe, expect, it } from 'vitest'

import type { Analytics } from '#/modules/analytics'

import { changeText, monthsOf, rateChangeText, rateText, shareText } from './format'
import { fundsCsv, fundsCsvName } from './funds-csv'
import { paceSummary } from './pace-summary'

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

    const summary = paceSummary({ lastWeek: 20, points })

    expect(summary).toMatchObject({ lastYear: 2025, year: 2026 })
    expect(summary?.ahead).toBeCloseTo(0.1)
    expect(summary?.projected).toBeCloseTo(440)
  })

  it('has nothing to say without last year', () => {
    expect.hasAssertions()

    expect(paceSummary({ lastWeek: 20, points: points.slice(3) })).toBeNull()
    expect(paceSummary({ lastWeek: 20, points: [] })).toBeNull()
  })
})
