import { queryOptions } from '@tanstack/react-query'

import type { User } from '#/db/schema'

import { getAvailableTransactionYears } from './-data/overview.get-available-transaction-years.procedure'
import { getOverviewData } from './-data/overview.get-data.procedure'

export function createAvailableTransactionYearsQuery(
  userId: User['id'],
  journey: User['journey'],
) {
  return queryOptions({
    queryKey: ['overview-years', journey, userId],
    queryFn: () => getAvailableTransactionYears({ data: { journey } }),
    // 5 minutes
    staleTime: 5 * 60 * 1000,
  })
}

export function createOverviewQueryOptions(
  userId: User['id'],
  journey: User['journey'],
  year: 'all' | number,
) {
  return queryOptions({
    queryKey: ['overview', { userId, year, journey }],
    queryFn: () => getOverviewData({ data: { year, journey } }),
  })
}
