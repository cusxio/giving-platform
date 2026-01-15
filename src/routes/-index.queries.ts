import { queryOptions } from '@tanstack/react-query'

import { getSavedPaymentMethods } from './-data/index.get-saved-payment-methods.procedure'

export function createSavedPaymentMethodsQueryOptions(authenticated: boolean) {
  return queryOptions({
    queryKey: ['saved-payment-methods', { authenticated }],
    queryFn: () => (authenticated ? getSavedPaymentMethods() : []),
  })
}
