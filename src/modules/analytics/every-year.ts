import { centsToRinggit } from '#/core/money'

import type { Range } from './period'
import { shiftYears, weekOfYear, yearOf } from './period'

/** Days 365 and 366 fold into week 52, so no year ends on a stub week of one or two days. */
const LAST_WEEK = 52

interface YearRow {
  readonly donors: number
  /** The year's first gift, a Kuala Lumpur `YYYY-MM-DD`. */
  readonly firstDay: string
  readonly gifts: number
  readonly median: number
  readonly received: number
  readonly year: number
}

interface WeekRow {
  readonly week: number
  readonly weeklyAmount: number
  readonly year: number
}

export interface EveryYearReads {
  readonly sameDaysLastYear: { readonly received: number } | null
  readonly weeks: readonly WeekRow[]
  /** Oldest first. */
  readonly years: readonly YearRow[]
}

/**
 * How a year's money compares. A first year that began after its first week has no full year to
 * compare with, so the year after it is the first full year rather than a misleading jump.
 */
export type Change =
  | { readonly kind: 'against'; readonly prior: number }
  | { readonly kind: 'first-full-year' }
  | { readonly kind: 'first-year' }

/** Every year of giving at once, in ringgit. Anonymous: counts, sums and medians only. */
export interface EveryYear {
  readonly firstYear: number
  readonly kpis: {
    readonly bestFullYear: { readonly received: number; readonly year: number } | null
    /** Compound growth per year, from the first full year to the last. */
    readonly growth: { readonly from: number; readonly rate: number; readonly to: number } | null
    readonly received: { readonly gifts: number; readonly received: number }
    readonly thisYear: { readonly change: Change; readonly received: number }
  }
  readonly pace: {
    /** Today's week. */
    readonly lastWeek: number
    readonly points: readonly {
      readonly cumulative: number
      readonly week: number
      readonly weekly: number
      readonly year: number
    }[]
  }
  /** Today's year. */
  readonly year: number
  /** Newest first. This year compares with the same days last year, the others with the year before. */
  readonly years: readonly {
    readonly change: Change
    readonly donors: number
    readonly gifts: number
    readonly median: number
    readonly received: number
    readonly year: number
  }[]
}

export const sameDaysLastYear = (today: string): Range => ({
  end: shiftYears(today, -1),
  start: `${yearOf(today) - 1}-01-01`,
})

/**
 * One point for every week of each year that has gifts, through today's week for this year. A week
 * without gifts is 0 that week and keeps the running total, so lines never join across a gap.
 */
function paceOf(
  weeks: readonly WeekRow[],
  year: number,
  lastWeek: number,
): EveryYear['pace']['points'] {
  const weeklyCents = new Map<number, Map<number, number>>()
  for (const row of weeks) {
    const byWeek = weeklyCents.get(row.year) ?? new Map<number, number>()
    const week = Math.min(row.week, LAST_WEEK)
    byWeek.set(week, (byWeek.get(week) ?? 0) + row.weeklyAmount)
    weeklyCents.set(row.year, byWeek)
  }
  return [...weeklyCents].flatMap(([of, byWeek]) => {
    let cumulative = 0
    return Array.from({ length: of === year ? lastWeek : LAST_WEEK }, (_, index) => {
      const weekly = byWeek.get(index + 1) ?? 0
      cumulative += weekly
      return {
        cumulative: centsToRinggit(cumulative),
        week: index + 1,
        weekly: centsToRinggit(weekly),
        year: of,
      }
    })
  })
}

function growthOf(fullYears: readonly YearRow[]): EveryYear['kpis']['growth'] {
  const [from] = fullYears
  const to = fullYears.at(-1)
  if (from === undefined || to === undefined || from === to) {
    return null
  }
  return {
    from: from.year,
    rate: (to.received / from.received) ** (1 / (to.year - from.year)) - 1,
    to: to.year,
  }
}

export function toEveryYear(today: string, reads: EveryYearReads): EveryYear {
  const year = yearOf(today)
  const lastWeek = Math.min(weekOfYear(today), LAST_WEEK)
  const [first] = reads.years
  const firstYear = first?.year ?? year
  const startedLate = first !== undefined && weekOfYear(first.firstDay) > 1
  const receivedIn = (wanted: number) =>
    reads.years.find((row) => row.year === wanted)?.received ?? 0

  const changeOf = (of: number): Change => {
    if (of === firstYear) {
      return { kind: 'first-year' }
    }
    if (startedLate && of === firstYear + 1) {
      return { kind: 'first-full-year' }
    }
    const prior = of === year ? (reads.sameDaysLastYear?.received ?? 0) : receivedIn(of - 1)
    return { kind: 'against', prior: centsToRinggit(prior) }
  }

  const fullYears = reads.years.filter(
    (row) => row.year < year && !(startedLate && row.year === firstYear),
  )
  const best = fullYears.reduce<YearRow | null>(
    (top, row) => (top === null || row.received > top.received ? row : top),
    null,
  )

  return {
    firstYear,
    kpis: {
      bestFullYear: best && { received: centsToRinggit(best.received), year: best.year },
      growth: growthOf(fullYears),
      received: {
        gifts: reads.years.reduce((sum, row) => sum + row.gifts, 0),
        received: centsToRinggit(reads.years.reduce((sum, row) => sum + row.received, 0)),
      },
      thisYear: { change: changeOf(year), received: centsToRinggit(receivedIn(year)) },
    },
    pace: { lastWeek, points: paceOf(reads.weeks, year, lastWeek) },
    year,
    years: reads.years
      .map((row) => ({
        change: changeOf(row.year),
        donors: row.donors,
        gifts: row.gifts,
        median: centsToRinggit(row.median),
        received: centsToRinggit(row.received),
        year: row.year,
      }))
      // oxlint-disable-next-line unicorn/no-array-sort -- Avoid toSorted until the runtime lib supports it.
      .sort((a, b) => b.year - a.year),
  }
}
