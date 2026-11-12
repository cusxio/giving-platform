import type { Analytics } from '#/modules/analytics'

type Point = Analytics['pace']['points'][number]

/** A year's running total at `week`: its last point on or before it, in week order. */
const totalAt = (points: readonly Point[], year: number, week: number) =>
  points.reduce(
    (total, point) => (point.year === year && point.week <= week ? point.cumulative : total),
    0,
  )

const totalOf = (points: readonly Point[], year: number) => totalAt(points, year, 53)

/**
 * The newest year against the one before at the same week, and where the newest year ends if it
 * keeps last year's shape. `null` when last year had nothing by then to compare with.
 */
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
