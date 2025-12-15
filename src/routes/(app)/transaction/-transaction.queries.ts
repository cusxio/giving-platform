import { queryOptions } from '@tanstack/react-query'

import type { Transaction } from '#/db/schema'

import { getTransactionData } from './-data/transaction.get-data.procedure'

export function createTransactionQueryOptions(
  transactionId: Transaction['id'],
) {
  return queryOptions({
    queryKey: ['transaction', { transactionId }],
    queryFn: () => getTransactionData({ data: { transactionId } }),
  })
}
