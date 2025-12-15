import { addYears, clientTz, serverTz, startOfYear, TZDate } from '#/core/date'
import { centsToRinggit } from '#/core/money'

import type { OverviewRepository } from './overview.repository'

export function formatContributionStats(
  contributionStats:
    | Awaited<ReturnType<OverviewRepository['contributionStatsQuery']>>[0]
    | undefined,
) {
  const totalAmountInCents = contributionStats?.totalAmount ?? 0
  const averageAmountInCents = contributionStats?.averageAmount ?? 0
  const largestAmountInCents = contributionStats?.largestAmount ?? 0

  return {
    totalAmount: centsToRinggit(totalAmountInCents),
    noOfContributions: contributionStats?.noOfContributions ?? 0,
    averageAmount: centsToRinggit(averageAmountInCents),
    largestAmount: centsToRinggit(largestAmountInCents),
  }
}

export function formatLargestTransactionDate(
  transactionDate:
    | Awaited<ReturnType<OverviewRepository['largestTransactionDateQuery']>>[0]
    | undefined,
) {
  return { largestAmountDate: transactionDate?.date ?? null }
}

export function formatTotalFundsSupported(
  data:
    | Awaited<ReturnType<OverviewRepository['getTotalFundsSupported']>>[0]
    | undefined,
) {
  return { totalFundsSupported: data?.totalFundsSupported ?? 0 }
}

export function getYearDateRange(year: 'all' | number) {
  if (year === 'all') {
    return { startDateUTC: undefined, endDateUTCExclusive: undefined }
  }

  const referenceDate = new TZDate(year, 0, 1, clientTz)
  const startDate = startOfYear(referenceDate)
  const endDate = startOfYear(addYears<TZDate>(startDate, 1))

  return {
    startDateUTC: new Date(startDate.withTimeZone(serverTz)),
    endDateUTCExclusive: new Date(endDate.withTimeZone(serverTz)),
  }
}

export function zeroFillMonthlyContributionsData(
  data: Awaited<ReturnType<OverviewRepository['contributionsPerMonthQuery']>>,
) {
  if (data.length === 0) return []
  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  const dataMap = new Map(data.map((d) => [d.month, d.totalAmount]))
  return months.map((month) => ({
    month,
    totalAmount: centsToRinggit(dataMap.get(month) ?? 0),
  }))
}

export function zeroFillMonthlyFrequencyData(
  data: Awaited<
    ReturnType<OverviewRepository['contributionsFrequencyPerMonthQuery']>
  >,
) {
  if (data.length === 0) return []

  // 1. Collect unique fund names
  const allFunds = [...new Set(data.map((d) => d.fund))]

  // 2. Create a zero-filled base template for all funds
  const baseFund = Object.fromEntries(allFunds.map((fund) => [fund, 0]))

  // 3. Pre-populate all months in a map
  const monthlyDataMap = new Map<
    number,
    { [fund: string]: number; month: number }
  >()
  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  for (const month of months) {
    monthlyDataMap.set(month, { month, ...baseFund })
  }

  // 4. Fill in actual data in a single pass
  for (const { month, fund, frequency } of data) {
    const monthData = monthlyDataMap.get(month)
    if (monthData) {
      monthData[fund] = frequency
    }
  }

  return [...monthlyDataMap.values()]
}
