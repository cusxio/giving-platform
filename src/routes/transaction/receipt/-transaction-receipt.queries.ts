import { queryOptions } from '@tanstack/react-query'
import { isNotFound } from '@tanstack/react-router'

import type { Transaction } from '#/db/schema'

import { getTransactionReceiptData } from './-data/transaction-receipt.get-data.procedure'

export function createTransactionQueryOptions(
  transactionId: Transaction['id'],
) {
  return queryOptions({
    refetchInterval(query) {
      const status = query.state.data?.transaction.status

      return status === 'pending' ? 2000 : false
    },
    retry: (failureCount, error) => {
      if (isNotFound(error)) return false

      return failureCount <= 30
    },
    queryKey: ['transaction/receipt', { transactionId }],
    queryFn: () => getTransactionReceiptData({ data: { transactionId } }),
  })
}
