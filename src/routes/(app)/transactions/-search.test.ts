import { describe, expect, it } from 'vitest'

import { Route } from './route'

interface Search {
  readonly page?: number
}
// The route's own two steps, called as the router calls them for a URL's search.
const validateSearch = Route.options.validateSearch as (search: Record<string, unknown>) => Search
const beforeLoad = Route.options.beforeLoad as (options: { search: Search }) => { page: number }

const pageOf = (search: Record<string, unknown>) => beforeLoad({ search: validateSearch(search) })

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
