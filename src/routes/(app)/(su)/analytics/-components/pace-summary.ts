import type { EveryYear } from '#/modules/analytics'

import { compactCurrency, weekStartText, wholeCurrency } from './format'

type Point = Pick<EveryYear['pace']['points'][number], 'cumulative' | 'week' | 'year'>

interface Pace {
  readonly lastWeek: number
  readonly points: readonly Point[]
}

function totalAt(points: readonly Point[], year: number, week: number) {
  let latest: Point | undefined
  for (const point of points) {
    if (
      point.year === year &&
      point.week <= week &&
      (latest === undefined || point.week > latest.week)
    ) {
      latest = point
    }
  }
  return latest?.cumulative ?? 0
}

const totalOf = (points: readonly Point[], year: number) =>
  totalAt(points, year, Number.POSITIVE_INFINITY)

function paceSummary(pace: Pace, year: number) {
  const soFar = totalAt(pace.points, year, pace.lastWeek)
  const lastYearSoFar = totalAt(pace.points, year - 1, pace.lastWeek)
  if (lastYearSoFar === 0) {
    return null
  }
  const earlier = new Set(pace.points.map((point) => point.year).filter((y) => y < year - 1))
  return {
    ahead: soFar / lastYearSoFar - 1,
    aheadOfEvery:
      earlier.size > 0 &&
      soFar > lastYearSoFar &&
      [...earlier].every((y) => soFar > totalAt(pace.points, y, pace.lastWeek)),
    lastYear: year - 1,
    projected: totalOf(pace.points, year - 1) * (soFar / lastYearSoFar),
    year,
  }
}

export function runningTakeaway(pace: Pace, year: number) {
  const summary = paceSummary(pace, year)
  if (summary === null) {
    return 'Running total from 1 January, one line per year.'
  }
  const ahead = Math.round(summary.ahead * 100)
  const position =
    ahead === 0
      ? `level with ${summary.lastYear}`
      : `${Math.abs(ahead)}% ${ahead > 0 ? 'ahead of' : 'behind'} ${summary.lastYear}`
  const every = summary.aheadOfEvery ? ', and ahead of every earlier year' : ''
  return `${year} is ${position} at this point${every}. At this pace it ends near ${compactCurrency.format(summary.projected)}.`
}

export function weeklyTakeaway(
  points: EveryYear['pace']['points'],
  shown: readonly number[],
  picked: number,
) {
  const against = shown.find((year) => year !== picked)
  const intro =
    against === undefined ? `Each week of ${picked}.` : `Each week of ${picked} against ${against}.`
  const biggest = points
    .filter((point) => point.year === picked)
    .reduce<EveryYear['pace']['points'][number] | null>(
      (top, point) => (top === null || point.weekly > top.weekly ? point : top),
      null,
    )
  return biggest === null
    ? intro
    : `${intro} Its biggest week began ${weekStartText(picked, biggest.week)}, with ${wholeCurrency.format(biggest.weekly)}.`
}
