import type { Analytics } from '#/modules/analytics'

type Point = Analytics['pace']['points'][number]

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

const totalOf = (points: readonly Point[], year: number) => totalAt(points, year, 53)

export function paceSummary(pace: Analytics['pace']) {
  const year = Math.max(...pace.points.map((point) => point.year))
  const soFar = totalAt(pace.points, year, pace.lastWeek)
  const lastYearSoFar = totalAt(pace.points, year - 1, pace.lastWeek)
  if (!Number.isFinite(year) || lastYearSoFar === 0) {
    return null
  }
  return {
    ahead: soFar / lastYearSoFar - 1,
    lastYear: year - 1,
    projected: totalOf(pace.points, year - 1) * (soFar / lastYearSoFar),
    year,
  }
}
