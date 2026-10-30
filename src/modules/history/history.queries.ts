import { queryOptions } from '@tanstack/react-query'

import {
  getAvailableYears,
  getOverview,
  getTransaction,
  getTransactions,
} from './history.functions'
import type { Donor, TransactionId } from './history.repository.server'
import type { OverviewYear } from './overview'

export function availableYearsQuery(userId: Donor['id'], journey: Donor['journey']) {
  return queryOptions({
    queryKey: ['overview-years', journey, userId],
    queryFn: () => getAvailableYears({ data: { journey } }),
    // 5 minutes
    staleTime: 5 * 60 * 1000,
  })
}

export function overviewQuery(userId: Donor['id'], journey: Donor['journey'], year: OverviewYear) {
  return queryOptions({
    queryFn: () => getOverview({ data: { journey, year } }),
    queryKey: ['overview', { journey, userId, year }],
  })
}

export function transactionsQuery(userId: Donor['id'], journey: Donor['journey'], page = 1) {
  return queryOptions({
    queryFn: () => getTransactions({ data: { journey, page } }),
    queryKey: ['transactions', { journey, page, userId }],
  })
}

export function transactionQuery(transactionId: TransactionId) {
  return queryOptions({
    queryFn: () => getTransaction({ data: { transactionId } }),
    queryKey: ['transaction', { transactionId }],
  })
}
