import { describe, expect, it } from 'vitest'

import { Route } from './route'

interface Search {
  readonly end_date?: string
  readonly start_date?: string
}
const validateSearch = Route.options.validateSearch as (search: Record<string, unknown>) => Search

describe('the reports date range from a link', () => {
  it.each([
    [{ end_date: '2026-10-31', start_date: '2026-10-01' }, '2026-10-01', '2026-10-31'],
    [{}, undefined, undefined],
    [{ end_date: '2026-10-31', start_date: 'garbage' }, undefined, '2026-10-31'],
    [{ end_date: 20_261_031, start_date: '2026-10-01' }, '2026-10-01', undefined],
    [{ end_date: '2026-13-40', start_date: true }, undefined, undefined],
  ])('reads %o as start %s and end %s, naming both keys', (search, start_date, end_date) => {
    expect.hasAssertions()

    expect(validateSearch(search)).toStrictEqual({ end_date, start_date })
  })
})
