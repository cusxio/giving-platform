import { TZDate, addYears, clientTz, serverTz, startOfYear } from '#/core/date'
import { centsToRinggit } from '#/core/money'
import type { QueryResult } from '#/server/db.server'

import type {
  Donor,
  DonorScope,
  recentTransactions,
  successFundItems,
  successTimeline,
} from './history.repository.server'

/** A Kuala Lumpur calendar year, or every year. */
export type OverviewYear = 'all' | number

export type Overview = ReturnType<typeof summarizeOverview>

export function getYearDateRange(year: OverviewYear) {
  if (year === 'all') {
    return { endDateUTCExclusive: undefined, startDateUTC: undefined }
  }

  const referenceDate = new TZDate(year, 0, 1, clientTz)
  const startDate = startOfYear(referenceDate)
  const endDate = startOfYear(addYears<TZDate>(startDate, 1))

  return {
    endDateUTCExclusive: new Date(endDate.withTimeZone(serverTz)),
    startDateUTC: new Date(startDate.withTimeZone(serverTz)),
  }
}

export function scopeFor(donor: Donor, year: OverviewYear): DonorScope {
  const { startDateUTC, endDateUTCExclusive } = getYearDateRange(year)
  return { donor, endExclusive: endDateUTCExclusive, start: startDateUTC }
}

export function summarizeOverview(
  recentTransactionRows: QueryResult<typeof recentTransactions>,
  timelineData: QueryResult<typeof successTimeline>,
  fundData: QueryResult<typeof successFundItems>,
) {
  // --- Processing: Summary & Timeline (Single Pass) ---

  let totalAmount = 0
  let largestAmount = 0
  let largestAmountDate: Date | null = null
  const monthlyMap = new Map<number, number>()
  const dailyMap = new Map<string, number>()

  for (const t of timelineData) {
    // 1. Summary totals
    totalAmount += t.amount
    if (t.amount > largestAmount) {
      largestAmount = t.amount
      largestAmountDate = t.createdAt
    }

    const tzDate = new TZDate(t.createdAt, clientTz)

    // 2. Monthly Contributions
    const month = tzDate.getMonth() + 1
    monthlyMap.set(month, (monthlyMap.get(month) ?? 0) + t.amount)

    // 3. Daily Map for Cumulative
    const day = tzDate.toISOString().slice(0, 10)
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + t.amount)
  }

  const noOfContributions = timelineData.length
  const averageAmount = noOfContributions > 0 ? Math.round(totalAmount / noOfContributions) : 0

  const monthlyContributions = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    totalAmount: centsToRinggit(monthlyMap.get(i + 1) ?? 0),
  }))

  // oxlint-disable-next-line unicorn/no-array-sort -- Avoid toSorted until the runtime lib supports it.
  const sortedDays = [...dailyMap.keys()].sort((a, b) => a.localeCompare(b))
  let cumulative = 0
  const cumulativeContributions = sortedDays.map((day) => {
    cumulative += dailyMap.get(day) ?? 0
    return { cumulativeAmount: centsToRinggit(cumulative), day }
  })

  // --- Processing: Fund Frequency (Single Pass) ---

  const frequencyMap = new Map<string, number>()
  const allFunds = new Set<string>()
  const uniqueFundIds = new Set<string>()

  for (const item of fundData) {
    uniqueFundIds.add(item.fundId)
    allFunds.add(item.fundName)

    const month = new TZDate(item.createdAt, clientTz).getMonth() + 1
    const key = `${month}:${item.fundName}`
    frequencyMap.set(key, (frequencyMap.get(key) ?? 0) + 1)
  }

  const monthlyContributionsFrequency =
    allFunds.size === 0
      ? []
      : Array.from({ length: 12 }, (_, i) => {
          const month = i + 1
          const entry: { [fund: string]: number; month: number } = { month }
          for (const fund of allFunds) {
            entry[fund] = frequencyMap.get(`${month}:${fund}`) ?? 0
          }
          return entry
        })

  return {
    cumulativeContributions,
    monthlyContributions,
    monthlyContributionsFrequency,
    summary: {
      averageAmount: centsToRinggit(averageAmount),
      largestAmount: centsToRinggit(largestAmount),
      largestAmountDate,
      noOfContributions,
      totalAmount: centsToRinggit(totalAmount),
      totalFundsSupported: uniqueFundIds.size,
    },
    transactions: recentTransactionRows,
  }
}
