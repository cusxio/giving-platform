import { describe, expect, it } from 'vitest'

import type { DonorRow } from './donors'
import { classifyDonors } from './donors'
import { resolvePeriod, windowsOf } from './period'

// 1 Jan to 10 Nov 2026, against 1 Jan to 10 Nov 2025. The gave-again rate follows the donors of
// 11 Nov 2024 to 10 Nov 2025, and last year's rate those of 11 Nov 2023 to 10 Nov 2024.
const windows = windowsOf(resolvePeriod({}, '2026-11-10'))

const day = (iso: string) => new Date(`${iso}T00:00:00+08:00`)

function donor(row: Partial<Omit<DonorRow, 'firstGiftAt'>> & { first: string }): DonorRow {
  const { first, ...sums } = row
  return {
    compare: 0,
    firstGiftAt: day(first),
    last12Months: 0,
    months12to24: 0,
    months24to36: 0,
    monthsGivenLast12: 0,
    period: 0,
    yearBeforePeriod: 0,
    ...sums,
  }
}

/** Gave once in 2019 and never since: gives every test three years of history. */
const LONG_GONE = donor({ first: '2019-05-01' })

const classify = (...rows: DonorRow[]) => classifyDonors([LONG_GONE, ...rows], windows)

describe('who gave this period', () => {
  it('splits donors into new, returning, and back after a gap', () => {
    expect.hasAssertions()

    const summary = classify(
      donor({ first: '2026-03-01', period: 5000 }),
      donor({ first: '2026-01-01', period: 5000 }),
      donor({ first: '2023-02-01', period: 5000, yearBeforePeriod: 100 }),
      donor({ first: '2021-02-01', period: 5000 }),
    )

    expect(summary.segments).toStrictEqual({ cameBack: 1, new: 2, returning: 1 })
  })

  it('counts who gave in the year before and not yet in the period', () => {
    expect.hasAssertions()

    const summary = classify(
      donor({ first: '2024-02-01', yearBeforePeriod: 100 }),
      donor({ first: '2024-02-01', yearBeforePeriod: 100 }),
      donor({ first: '2021-02-01', months24to36: 100 }),
    )

    expect(summary.notYet).toBe(2)
    expect(summary.segments).toStrictEqual({ cameBack: 0, new: 0, returning: 0 })
  })
})

describe('gave again within 12 months', () => {
  it('follows first-time givers and repeat givers of the window separately', () => {
    expect.hasAssertions()

    const summary = classify(
      donor({ first: '2025-03-01', last12Months: 100, months12to24: 100 }),
      donor({ first: '2024-11-11', months12to24: 100 }),
      donor({ first: '2025-01-01', months12to24: 100 }),
      donor({ first: '2022-01-01', last12Months: 100, months12to24: 100 }),
      donor({ first: '2024-11-10', last12Months: 100, months12to24: 100 }),
      donor({ first: '2022-01-01', months12to24: 100 }),
      donor({ first: '2026-02-01', last12Months: 100, period: 100 }),
    )

    expect(summary.gaveAgain.firstTime).toStrictEqual({ gaveAgain: 1, of: 3 })
    expect(summary.gaveAgain.repeat).toStrictEqual({ gaveAgain: 2, of: 3 })
    expect(summary.gaveAgain.all.value).toStrictEqual({ gaveAgain: 3, of: 6 })
  })

  it("reads last year's rate one year further back", () => {
    expect.hasAssertions()

    const summary = classify(
      donor({ first: '2024-01-01', months12to24: 100, months24to36: 100 }),
      donor({ first: '2024-01-01', months24to36: 100 }),
    )

    expect(summary.gaveAgain.all.prior).toStrictEqual({ gaveAgain: 1, of: 2 })
  })

  it('keeps a small count as counts, for the page to show without a percentage', () => {
    expect.hasAssertions()

    const summary = classify(
      donor({ first: '2025-01-01', last12Months: 100, months12to24: 100 }),
      donor({ first: '2025-01-01', last12Months: 100, months12to24: 100 }),
      donor({ first: '2025-01-01', months12to24: 100 }),
    )

    expect(summary.gaveAgain.firstTime).toStrictEqual({ gaveAgain: 2, of: 3 })
  })

  it('has no rate without two years of history, and no last-year rate without three', () => {
    expect.hasAssertions()

    const young = classifyDonors(
      [donor({ first: '2024-12-01', last12Months: 100, months12to24: 100 })],
      windows,
    )
    const twoYears = classifyDonors(
      [donor({ first: '2024-11-11', last12Months: 100, months12to24: 100 })],
      windows,
    )
    const none = classifyDonors([], windows)

    expect(young.gaveAgain).toStrictEqual({
      all: { prior: null, value: null },
      firstTime: null,
      repeat: null,
    })
    expect(twoYears.gaveAgain.all).toStrictEqual({ prior: null, value: { gaveAgain: 1, of: 1 } })
    expect(none.gaveAgain.all).toStrictEqual({ prior: null, value: null })
  })
})

describe('returning donors against the same days last year', () => {
  const MORE = { less: 0, more: 1, same: 0 }
  const SAME = { less: 0, more: 0, same: 1 }
  const LESS = { less: 1, more: 0, same: 0 }

  it.each([
    [1101, MORE],
    [1100, SAME],
    [1000, SAME],
    [900, SAME],
    [899, LESS],
  ])('reads %i cents against 1000 as %o', (period, expected) => {
    expect.hasAssertions()

    const summary = classify(donor({ compare: 1000, first: '2020-01-01', period }))

    expect(summary.change).toStrictEqual(expected)
  })

  it('leaves out donors who missed either span', () => {
    expect.hasAssertions()

    const summary = classify(
      donor({ first: '2026-02-01', period: 1000 }),
      donor({ compare: 1000, first: '2024-02-01', yearBeforePeriod: 1000 }),
    )

    expect(summary.change).toStrictEqual({ less: 0, more: 0, same: 0 })
  })
})

describe('regular givers', () => {
  it('counts donors who gave in six of the last 12 months, and their share of that money', () => {
    expect.hasAssertions()

    const summary = classify(
      donor({ first: '2020-01-01', last12Months: 6000, monthsGivenLast12: 6 }),
      donor({ first: '2020-01-01', last12Months: 1500, monthsGivenLast12: 12 }),
      donor({ first: '2020-01-01', last12Months: 2500, monthsGivenLast12: 5 }),
    )

    expect(summary.regular).toStrictEqual({ donors: 2, shareOfMoney: 0.75 })
  })

  it('reads a share of zero when nobody gave in the last 12 months', () => {
    expect.hasAssertions()

    expect(classify().regular).toStrictEqual({ donors: 0, shareOfMoney: 0 })
  })
})
