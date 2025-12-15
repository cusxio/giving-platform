import { queryOptions } from '@tanstack/react-query'

import { getSavedPaymentMethods } from './-data/index.get-saved-payment-methods.procedure'

export function createSavedPaymentMethodsQueryOptions(enabled: boolean) {
  return queryOptions({
    queryKey: ['saved-payment-methods'],
    queryFn: () => getSavedPaymentMethods(),
    enabled,
  })
}
