import { QueryClient, queryOptions } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import type * as History from '#/modules/history'

const getTransactions = vi.hoisted(() => vi.fn<(page: number) => Promise<unknown>>())

vi.mock<typeof History>(import('#/modules/history'), async (actual) => {
  const history = await actual()
  return {
    ...history,
    transactionsQuery: (userId, journey, page) =>
      queryOptions({
        ...history.transactionsQuery(userId, journey, page),
        queryFn: () => getTransactions(page ?? 1) as never,
      }),
  }
})

const { Route } = await import('./route')

interface Search {
  readonly page?: number
}
interface Deps {
  readonly page: number
}
const validateSearch = Route.options.validateSearch as (search: Record<string, unknown>) => Search
const loaderDeps = Route.options.loaderDeps as (options: { search: Search }) => Deps
const loader = Route.options.loader as (options: {
  context: unknown
  deps: Deps
}) => Promise<unknown>

const pageOf = (search: Record<string, unknown>) => loaderDeps({ search: validateSearch(search) })

describe('the transactions page number', () => {
  it.each([
    [{ page: 3 }, 3],
    [{}, 1],
    [{ page: 0 }, 1],
    [{ page: -1 }, 1],
    [{ page: 1.5 }, 1],
    [{ page: 1e21 }, 1],
    [{ page: -1e21 }, 1],
    [{ page: Number.MAX_SAFE_INTEGER + 1 }, 1],
    [{ page: Number.MAX_SAFE_INTEGER }, Number.MAX_SAFE_INTEGER],
  ])('reads %o as page %i', (search, page) => {
    expect.hasAssertions()

    expect(pageOf(search)).toStrictEqual({ page })
  })
})

describe('the transactions loader', () => {
  it('loads the page the search names', async () => {
    expect.hasAssertions()
    getTransactions.mockResolvedValue({ pageSize: 10, totalCount: 0, transactions: [] })
    const context = { queryClient: new QueryClient(), user: { id: 7, journey: 'migrate' } }

    await loader({ context, deps: pageOf({ page: 2 }) })
    await loader({ context, deps: pageOf({ page: 3 }) })

    expect(getTransactions.mock.calls).toStrictEqual([[2], [3]])
  })
})
