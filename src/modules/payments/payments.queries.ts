import { queryOptions, useMutation } from '@tanstack/react-query'
import { isNotFound } from '@tanstack/react-router'

import { getReceipt, getSavedPaymentMethods, startContribution } from './payments.functions'
import type { ReceiptInput } from './receipt.server'
import type { StartContributionInput } from './start-contribution.server'

export function useStartContributionMutation() {
  return useMutation({
    mutationFn: (input: StartContributionInput) => startContribution({ data: input }),
  })
}

export function savedPaymentMethodsQuery(authenticated: boolean) {
  return queryOptions({
    queryFn: () => (authenticated ? getSavedPaymentMethods() : []),
    queryKey: ['saved-payment-methods', { authenticated }],
  })
}

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
