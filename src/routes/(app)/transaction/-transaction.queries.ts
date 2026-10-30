import { queryOptions } from '@tanstack/react-query'

import type { Transaction } from '#/server/schema.server'

import { getTransactionData } from './-data/transaction.get-data.procedure'

export function createTransactionQueryOptions(transactionId: Transaction['id']) {
  return queryOptions({
    queryFn: () => getTransactionData({ data: { transactionId } }),
    queryKey: ['transaction', { transactionId }],
  })
}
