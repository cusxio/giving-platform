import { centsToRinggit } from '#/core/money'

export type Insights = ReturnType<typeof summarizeInsights>

interface SummaryRow {
  readonly averageAmount: number
  readonly guestCount: number
  readonly medianAmount: number
  readonly noOfContributions: number
  readonly totalAmount: number
  readonly userCount: number
  readonly weekdayCount: number
  readonly weekendCount: number
}

interface WeeklyTotalRow {
  readonly cumulativeAmount: number
  readonly week: number
  readonly weeklyAmount: number
  readonly year: number
}

export function summarizeInsights(
  summaryResult: readonly SummaryRow[],
  weeklyCumulativeTotalsByYearResult: readonly WeeklyTotalRow[],
) {
  const [stats] = summaryResult
  const noOfContributions = stats?.noOfContributions ?? 0

  const toPercent = (count: number) =>
    noOfContributions > 0 ? ((count / noOfContributions) * 100).toFixed(2) : '0.00'

  const summary = {
    averageAmount: centsToRinggit(stats?.averageAmount ?? 0),
    medianAmount: centsToRinggit(stats?.medianAmount ?? 0),
    noOfContributions,
    totalAmount: centsToRinggit(stats?.totalAmount ?? 0),
  }

  const weekendWeekday = [
    { percent: toPercent(stats?.weekendCount ?? 0), period: 'weekend' },
    { percent: toPercent(stats?.weekdayCount ?? 0), period: 'weekday' },
  ]

  const userGuest = [
    { createdAs: 'user' as const, percent: toPercent(stats?.userCount ?? 0) },
    { createdAs: 'guest' as const, percent: toPercent(stats?.guestCount ?? 0) },
  ]

  const weeklyCumulativeTotals = weeklyCumulativeTotalsByYearResult.map((row) => ({
    cumulativeAmount: centsToRinggit(row.cumulativeAmount),
    week: row.week,
    weeklyAmount: centsToRinggit(row.weeklyAmount),
    year: row.year,
  }))

  return {
    summary,
    userGuest,
    weekendWeekday,
    weeklyCumulativeTotalsByYear: weeklyCumulativeTotals,
  }
}
