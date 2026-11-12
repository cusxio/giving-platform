import type { Span, Windows } from './period'

export interface DonorRow {
  readonly compare: number
  readonly firstGiftAt: Date
  readonly last12Months: number
  readonly months12to24: number
  readonly months24to36: number
  readonly monthsGivenLast12: number
  readonly period: number
  readonly yearBeforePeriod: number
}

export interface Rate {
  readonly gaveAgain: number
  readonly of: number
}

export const REGULAR_MIN_MONTHS = 6

const SAME_WITHIN_PERCENT = 10

type Change = 'less' | 'more' | 'same'

function changeOf(now: number, before: number): Change {
  if (Math.abs(now - before) * 100 <= before * SAME_WITHIN_PERCENT) {
    return 'same'
  }
  return now > before ? 'more' : 'less'
}

const historyReachesStartOf = (window: Span, earliest: Date | undefined) =>
  earliest !== undefined && earliest <= window.start

function gaveAgain(
  rows: readonly DonorRow[],
  earliest: Date | undefined,
  window: Span,
  gaveIn: (row: DonorRow) => number,
  gaveAfter: (row: DonorRow) => number,
) {
  if (!historyReachesStartOf(window, earliest)) {
    return { all: null, firstTime: null, repeat: null }
  }
  const firstTime = { gaveAgain: 0, of: 0 }
  const repeat = { gaveAgain: 0, of: 0 }
  for (const row of rows) {
    if (gaveIn(row) > 0) {
      const rate = row.firstGiftAt >= window.start ? firstTime : repeat
      rate.of += 1
      rate.gaveAgain += gaveAfter(row) > 0 ? 1 : 0
    }
  }
  const all: Rate = {
    gaveAgain: firstTime.gaveAgain + repeat.gaveAgain,
    of: firstTime.of + repeat.of,
  }
  return { all, firstTime, repeat }
}

export function classifyDonors(rows: readonly DonorRow[], windows: Windows) {
  const segments = { cameBack: 0, new: 0, returning: 0 }
  const change: Record<Change, number> = { less: 0, more: 0, same: 0 }
  const regular = { donors: 0, money: 0 }
  let notYet = 0
  let last12Money = 0
  let earliest: Date | undefined

  for (const row of rows) {
    if (earliest === undefined || row.firstGiftAt < earliest) {
      earliest = row.firstGiftAt
    }
    if (row.period > 0) {
      if (row.firstGiftAt >= windows.period.start) {
        segments.new += 1
      } else if (row.yearBeforePeriod > 0) {
        segments.returning += 1
      } else {
        segments.cameBack += 1
      }
      if (row.compare > 0) {
        change[changeOf(row.period, row.compare)] += 1
      }
    } else if (row.yearBeforePeriod > 0) {
      notYet += 1
    }
    last12Money += row.last12Months
    if (row.monthsGivenLast12 >= REGULAR_MIN_MONTHS) {
      regular.donors += 1
      regular.money += row.last12Months
    }
  }

  const current = gaveAgain(
    rows,
    earliest,
    windows.months12to24,
    (row) => row.months12to24,
    (row) => row.last12Months,
  )
  const prior = gaveAgain(
    rows,
    earliest,
    windows.months24to36,
    (row) => row.months24to36,
    (row) => row.months12to24,
  )

  return {
    change,
    gaveAgain: {
      all: { prior: prior.all, value: current.all },
      firstTime: current.firstTime,
      repeat: current.repeat,
    },
    notYet,
    regular: {
      donors: regular.donors,
      shareOfMoney: last12Money > 0 ? regular.money / last12Money : 0,
    },
    segments,
  }
}
