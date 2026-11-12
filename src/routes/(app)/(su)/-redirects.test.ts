import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'

import { Route as InsightsRoute } from './insights'
import { Route as ReportsRoute } from './reports'

type Search = Record<string, unknown>

/** Runs a route's search validation and beforeLoad, as the router would, and returns the throw. */
function visit(route: typeof InsightsRoute | typeof ReportsRoute, raw: Search) {
  const validate = route.options.validateSearch as (search: Search) => Search
  const beforeLoad = route.options.beforeLoad as unknown as (options: { search: Search }) => unknown
  try {
    beforeLoad({ search: validate(raw) })
  } catch (error) {
    return error
  }
  return null
}

describe('the old analytics addresses', () => {
  it.each([
    [{}, { end: undefined, start: undefined }],
    [
      { end: '2026-10-31', start: '2026-10-01' },
      { end: '2026-10-31', start: '2026-10-01' },
    ],
    [
      { end: 'garbage', start: '2026-10-01' },
      { end: undefined, start: '2026-10-01' },
    ],
  ])('send /insights?%o to /analytics with %o', (raw, search) => {
    expect.hasAssertions()

    const thrown = visit(InsightsRoute, raw)

    expect(isRedirect(thrown)).toBe(true)
    expect(thrown).toMatchObject({ options: { search, to: '/analytics' } })
  })

  it.each([
    [{}, { end: undefined, start: undefined }],
    [
      { end_date: '2026-10-31', start_date: '2026-10-01' },
      { end: '2026-10-31', start: '2026-10-01' },
    ],
    [
      { end_date: 20_261_031, start_date: '2026-13-40' },
      { end: undefined, start: undefined },
    ],
  ])('send /reports?%o to /analytics with %o', (raw, search) => {
    expect.hasAssertions()

    const thrown = visit(ReportsRoute, raw)

    expect(isRedirect(thrown)).toBe(true)
    expect(thrown).toMatchObject({ options: { search, to: '/analytics' } })
  })
})
