import { queryOptions } from '@tanstack/react-query'

import { getWelcomeData } from './-data/welcome.get-data.procedure'

export function createWelcomeQueryOptions() {
  return queryOptions({
    queryKey: ['welcome'],
    queryFn: () => getWelcomeData(),
  })
}
