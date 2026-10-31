import { queryOptions } from '@tanstack/react-query'
import { isNotFound } from '@tanstack/react-router'

import { getReceipt } from './payments.functions'
import type { ReceiptInput } from './receipt.server'

export function receiptQuery(transactionId: ReceiptInput['transactionId']) {
  return queryOptions({
    queryFn: () => getReceipt({ data: { transactionId } }),
    queryKey: ['transaction/receipt', { transactionId }],
    refetchInterval(query) {
      const status = query.state.data?.transaction.status

      return status === 'pending' ? 2000 : false
    },
    retry: (failureCount, error) => {
      if (isNotFound(error)) {
        return false
      }

      return failureCount <= 30
    },
  })
}
