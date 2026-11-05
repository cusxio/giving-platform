import { QueryClient, queryOptions } from '@tanstack/react-query'
import { isRedirect } from '@tanstack/react-router'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { clientTz, now } from '#/core/date'
import type * as History from '#/modules/history'

import type * as Charts from '../-components/charts'

type Year = number | 'all'

const server = vi.hoisted(() => ({
  getAvailableYears: vi.fn<() => Promise<number[]>>(),
  getOverview: vi.fn<(year: Year) => Promise<unknown>>(),
}))

vi.mock<typeof History>(import('#/modules/history'), async (actual) => {
  const history = await actual()
  return {
    ...history,
    availableYearsQuery: (...args) =>
      queryOptions({ ...history.availableYearsQuery(...args), queryFn: server.getAvailableYears }),
    overviewQuery: (userId, journey, year) =>
      queryOptions({
        ...history.overviewQuery(userId, journey, year),
        queryFn: () => server.getOverview(year) as never,
      }),
  }
})

const chartCode = vi.hoisted(() => ({ loaded: false }))

vi.mock<typeof Charts>(import('../-components/charts'), async (actual) => {
  chartCode.loaded = true
  return actual()
})

const { Route } = await import('./route')
const { OverviewCharts } = await import('./-components/overview-charts')

interface Search {
  readonly year?: Year
}
const validateSearch = Route.options.validateSearch as (search: Record<string, unknown>) => Search
const loaderDeps = Route.options.loaderDeps as (options: { search: Search }) => Search
const loader = Route.options.loader as (options: {
  context: unknown
  deps: Search
}) => Promise<unknown>

const thisYear = now(clientTz).getFullYear()
const overview = { transactions: [] }
const charts = {
  cumulativeContributions: [{ cumulativeAmount: 100, day: '2026-01-05' }],
  monthlyContributions: [{ month: 1, totalAmount: 100 }],
  monthlyContributionsFrequency: [{ General: 1, month: 1 }],
  privacyMode: false,
  summary: {
    averageAmount: 100,
    largestAmount: 100,
    largestAmountDate: null,
    noOfContributions: 1,
    totalAmount: 100,
    totalFundsSupported: 1,
  },
}
const toOverview = { replace: true, search: { year: undefined }, to: '/overview' }

function given(years: () => Promise<number[]>, read: () => Promise<unknown>) {
  server.getAvailableYears.mockReset().mockImplementation(years)
  server.getOverview.mockReset().mockImplementation(read)
}

function load(search: Record<string, unknown>) {
  const context = { queryClient: new QueryClient(), user: { id: 7, journey: 'migrate' } }
  return loader({ context, deps: loaderDeps({ search: validateSearch(search) }) })
}

async function redirectOf(loading: Promise<unknown>) {
  const thrown = await loading.then(
    () => null,
    (error: unknown) => error,
  )
  return isRedirect(thrown) ? thrown.options : thrown
}

describe('the overview loader', () => {
  it('loads the chart code with the data, not with the route', async () => {
    expect.hasAssertions()
    given(
      () => Promise.resolve([thisYear]),
      () => Promise.resolve(overview),
    )
    expect(chartCode.loaded).toBe(false)

    await load({})

    expect(chartCode.loaded).toBe(true)
  })

  it('asks for the overview before the available years answer', async () => {
    expect.hasAssertions()
    const answer: { years?: (years: number[]) => void } = {}
    const years = new Promise<number[]>((resolve) => {
      answer.years = resolve
    })
    given(
      () => years,
      () => Promise.resolve(overview),
    )

    const loading = load({ year: thisYear - 1 })
    await vi.waitFor(() => {
      expect(server.getOverview.mock.calls).toStrictEqual([[thisYear - 1]])
    })
    answer.years?.([thisYear, thisYear - 1])

    await expect(loading).resolves.toStrictEqual({
      hasZeroTransactions: false,
      year: thisYear - 1,
      years: ['all', thisYear, thisYear - 1],
    })
  })

  it.each<[string, Record<string, unknown>, number[], Year, Year[]]>([
    ['no year', {}, [thisYear - 1], thisYear, [thisYear, thisYear - 1]],
    [
      'a past year with data',
      { year: thisYear - 2 },
      [thisYear - 1, thisYear - 2],
      thisYear - 2,
      ['all', thisYear, thisYear - 1, thisYear - 2],
    ],
    [
      'all years',
      { year: 'all' },
      [thisYear, thisYear - 1],
      'all',
      ['all', thisYear, thisYear - 1],
    ],
    ['an unreadable year', { year: 'soon' }, [], thisYear, [thisYear]],
    ['a year before 2000 as no year', { year: 1999 }, [], thisYear, [thisYear]],
    ['a year after next year as no year', { year: thisYear + 2 }, [], thisYear, [thisYear]],
    ['a year past any date as no year', { year: 99_999_999 }, [], thisYear, [thisYear]],
    ['a fractional year as no year', { year: thisYear - 0.5 }, [], thisYear, [thisYear]],
  ])('shows %s', async (_case, search, dataYears, year, years) => {
    expect.hasAssertions()
    given(
      () => Promise.resolve(dataYears),
      () => Promise.resolve(overview),
    )

    await expect(load(search)).resolves.toStrictEqual({
      hasZeroTransactions: dataYears.length === 0,
      year,
      years,
    })
    expect(server.getOverview.mock.calls).toStrictEqual([[year]])
  })

  it.each<[string, Record<string, unknown>, number[]]>([
    ['a year without data', { year: thisYear - 5 }, [thisYear - 1]],
    ['the current year, named', { year: thisYear }, [thisYear, thisYear - 1]],
    ['all years when only one has data', { year: 'all' }, [thisYear]],
  ])('sends %s to the plain overview', async (_case, search, dataYears) => {
    expect.hasAssertions()
    given(
      () => Promise.resolve(dataYears),
      () => Promise.resolve(overview),
    )

    await expect(redirectOf(load(search))).resolves.toMatchObject(toOverview)
  })

  it('redirects a year without data even when its overview read fails', async () => {
    expect.hasAssertions()
    given(
      () => Promise.resolve([thisYear - 1]),
      () => Promise.reject(new Error('no such year')),
    )

    await expect(redirectOf(load({ year: thisYear - 5 }))).resolves.toMatchObject(toOverview)
  })

  it('fails with the overview read', async () => {
    expect.hasAssertions()
    given(
      () => Promise.resolve([thisYear, thisYear - 1]),
      () => Promise.reject(new Error('overview failed')),
    )

    await expect(load({ year: thisYear - 1 })).rejects.toThrow('overview failed')
  })

  it('fails with the years read', async () => {
    expect.hasAssertions()
    given(
      () => Promise.reject(new Error('years failed')),
      () => Promise.resolve(overview),
    )

    await expect(load({ year: thisYear - 1 })).rejects.toThrow('years failed')
  })
})

describe('the overview charts', () => {
  it('draw in the first render once the loader has run', async () => {
    expect.hasAssertions()
    given(
      () => Promise.resolve([thisYear]),
      () => Promise.resolve(overview),
    )
    await load({})

    const html = renderToString(createElement(OverviewCharts, charts))

    expect(html).toContain('Contribution by Month')
    expect(html).toContain('Contribution Activity')
    expect(html).toContain('Cumulative Contribution')
  })
})
