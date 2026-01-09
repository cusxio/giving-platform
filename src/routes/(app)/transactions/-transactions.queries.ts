import { queryOptions } from '@tanstack/react-query'

import type { User } from '#/db/schema'

import { getTransactionsData } from './-data/transactions.get-data.procedure'

export function createTransactionsQueryOptions(
  userId: User['id'],
  journey: User['journey'],
  page = 1,
) {
  return queryOptions({
    queryKey: ['transactions', { userId, page, journey }],
    queryFn: () => getTransactionsData({ data: { page, journey } }),
  })
}
