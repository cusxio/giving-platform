import { queryOptions } from '@tanstack/react-query'

import {
  getAvailableYears,
  getOverview,
  getTransaction,
  getTransactions,
} from './history.functions'
import type { OverviewInput, TransactionInput } from './history.server'

type Journey = OverviewInput['journey']

export function availableYearsQuery(userId: number, journey: Journey) {
  return queryOptions({
    queryKey: ['overview-years', journey, userId],
    queryFn: () => getAvailableYears({ data: { journey } }),
    // 5 minutes
    staleTime: 5 * 60 * 1000,
  })
}

export function overviewQuery(userId: number, journey: Journey, year: OverviewInput['year']) {
  return queryOptions({
    queryFn: () => getOverview({ data: { journey, year } }),
    queryKey: ['overview', { journey, userId, year }],
  })
}

export function transactionsQuery(userId: number, journey: Journey, page = 1) {
  return queryOptions({
    queryFn: () => getTransactions({ data: { journey, page } }),
    queryKey: ['transactions', { journey, page, userId }],
  })
}

export function transactionQuery(transactionId: TransactionInput['transactionId']) {
  return queryOptions({
    queryFn: () => getTransaction({ data: { transactionId } }),
    queryKey: ['transaction', { transactionId }],
  })
}
