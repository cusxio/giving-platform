import { describe, expect, it } from 'vitest'

import {
  isIsoDate,
  isoDateOf,
  resolvePeriod,
  shiftYears,
  spanOf,
  weekOfYear,
  windowsOf,
} from './period'

describe('the period a search asks for', () => {
  it('is this year so far by default, against the same days last year', () => {
    expect.hasAssertions()

    expect(resolvePeriod({}, '2026-11-10')).toStrictEqual({
      compare: { end: '2025-11-10', start: '2025-01-01' },
      period: { end: '2026-11-10', start: '2026-01-01' },
    })
  })

  it('keeps the days asked for', () => {
    expect.hasAssertions()

    expect(resolvePeriod({ end: '2025-06-30', start: '2025-04-01' }, '2026-11-10')).toStrictEqual({
      compare: { end: '2024-06-30', start: '2024-04-01' },
      period: { end: '2025-06-30', start: '2025-04-01' },
    })
  })

  it('ends today at the latest, so a month still running compares like with like', () => {
    expect.hasAssertions()

    expect(
      resolvePeriod({ end: '2026-11-30', start: '2026-11-01' }, '2026-11-10').period,
    ).toStrictEqual({ end: '2026-11-10', start: '2026-11-01' })
  })

  it("starts on 1 January of its last day's year when only an end is given", () => {
    expect.hasAssertions()

    expect(resolvePeriod({ end: '2025-03-31' }, '2026-11-10').period).toStrictEqual({
      end: '2025-03-31',
      start: '2025-01-01',
    })
  })

  it('never starts after it ends', () => {
    expect.hasAssertions()

    expect(resolvePeriod({ start: '2027-01-01' }, '2026-11-10').period).toStrictEqual({
      end: '2026-11-10',
      start: '2026-11-10',
    })
  })
})

describe('calendar days', () => {
  it.each([
    ['2026-02-28', true],
    ['2024-02-29', true],
    ['2026-02-29', false],
    ['2026-13-01', false],
    ['2026-1-01', false],
    ['garbage', false],
  ])('reads %s as a date: %s', (value, expected) => {
    expect.hasAssertions()

    expect(isIsoDate(value)).toBe(expected)
  })

  it('moves 29 February to 28 February in a year without one', () => {
    expect.hasAssertions()

    expect(shiftYears('2024-02-29', -1)).toBe('2023-02-28')
    expect(shiftYears('2024-02-29', 4)).toBe('2028-02-29')
  })

  it('names the Kuala Lumpur day of an instant', () => {
    expect.hasAssertions()

    expect(isoDateOf(new Date('2026-11-10T16:30:00Z'))).toBe('2026-11-11')
  })

  it.each([
    ['2026-01-01', 1],
    ['2026-01-07', 1],
    ['2026-01-08', 2],
    ['2026-12-31', 53],
  ])('puts %s in week %i, counted from 1 January', (iso, week) => {
    expect.hasAssertions()

    expect(weekOfYear(iso)).toBe(week)
  })
})

describe('the windows the page reads', () => {
  it('turns Kuala Lumpur days into instants that end after the last day', () => {
    expect.hasAssertions()

    expect(spanOf({ end: '2025-03-31', start: '2025-03-01' })).toStrictEqual({
      end: new Date('2025-03-31T16:00:00Z'),
      start: new Date('2025-02-28T16:00:00Z'),
    })
  })

  it('places each trailing year before the period ends, and the year before it starts', () => {
    expect.hasAssertions()

    const windows = windowsOf(resolvePeriod({}, '2026-11-10'))

    expect(windows.last12Months).toStrictEqual(spanOf({ end: '2026-11-10', start: '2025-11-11' }))
    expect(windows.months12to24).toStrictEqual(spanOf({ end: '2025-11-10', start: '2024-11-11' }))
    expect(windows.months24to36).toStrictEqual(spanOf({ end: '2024-11-10', start: '2023-11-11' }))
    expect(windows.yearBeforePeriod).toStrictEqual(
      spanOf({ end: '2025-12-31', start: '2025-01-01' }),
    )
  })
})
