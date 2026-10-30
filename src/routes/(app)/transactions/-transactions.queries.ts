import { queryOptions } from '@tanstack/react-query'

import type { User } from '#/server/schema.server'

import { getTransactionsData } from './-data/transactions.get-data.procedure'

export function createTransactionsQueryOptions(
  userId: User['id'],
  journey: User['journey'],
  page = 1,
) {
  return queryOptions({
    queryFn: () => getTransactionsData({ data: { journey, page } }),
    queryKey: ['transactions', { journey, page, userId }],
  })
}
