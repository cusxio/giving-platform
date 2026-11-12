import { QueryClient, QueryClientProvider, queryOptions } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type * as AnalyticsModule from '#/modules/analytics'
import type { EveryYear } from '#/modules/analytics'

import type * as Charts from './-components/charts'

const chartCode = vi.hoisted(() => ({ loaded: false }))

const everyYear: EveryYear = {
  firstYear: 2024,
  kpis: {
    bestFullYear: { received: 1200, year: 2025 },
    growth: { from: 2024, rate: 0.2, to: 2025 },
    received: { gifts: 30, received: 3190 },
    thisYear: { change: { kind: 'against', prior: 900 }, received: 990 },
  },
  pace: {
    lastWeek: 45,
    points: [
      { cumulative: 800, week: 45, weekly: 20, year: 2024 },
      { cumulative: 1000, week: 52, weekly: 30, year: 2024 },
      { cumulative: 900, week: 45, weekly: 25, year: 2025 },
      { cumulative: 1200, week: 52, weekly: 40, year: 2025 },
      { cumulative: 990, week: 45, weekly: 35, year: 2026 },
    ],
  },
  year: 2026,
  years: [
    {
      change: { kind: 'against', prior: 900 },
      donors: 6,
      gifts: 10,
      median: 50.5,
      received: 990,
      year: 2026,
    },
    {
      change: { kind: 'against', prior: 1000 },
      donors: 7,
      gifts: 12,
      median: 60,
      received: 1200,
      year: 2025,
    },
    { change: { kind: 'first-year' }, donors: 5, gifts: 8, median: 40, received: 1000, year: 2024 },
  ],
}

vi.mock<typeof AnalyticsModule>(import('#/modules/analytics'), async (actual) => {
  const module = await actual()
  return {
    ...module,
    everyYearQuery: () =>
      queryOptions({ ...module.everyYearQuery(), queryFn: () => Promise.resolve(everyYear) }),
  }
})
vi.mock<typeof Charts>(import('./-components/charts'), async (actual) => {
  chartCode.loaded = true
  return actual()
})

const { Route } = await import('./index')

const loader = Route.options.loader as (options: { context: unknown }) => Promise<unknown>
const Page = Route.options.component as () => React.ReactNode

describe('the every year loader', () => {
  it('loads the chart code with the data, not with the route', async () => {
    expect.hasAssertions()
    expect(chartCode.loaded).toBe(false)

    await loader({ context: { queryClient: new QueryClient() } })

    expect(chartCode.loaded).toBe(true)
  })
})

async function firstRender() {
  const queryClient = new QueryClient()
  await loader({ context: { queryClient } })
  return renderToString(
    createElement(QueryClientProvider, { client: queryClient }, createElement(Page)),
  )
}

describe('the every year tab', () => {
  it('draws the totals since the first year in the first render', async () => {
    expect.hasAssertions()

    const html = await firstRender()

    expect(html).toContain('All donors, every year since 2024.')
    expect(html).toContain('Received since 2024')
    expect(html).toContain('▲ 10.0% vs same days of 2025')
    expect(html).toContain('+20%')
  })

  it('draws every year running from 1 January, this year picked', async () => {
    expect.hasAssertions()

    const html = await firstRender()

    expect(html).toContain(
      '2026 is 10% ahead of 2025 at this point, and ahead of every earlier year.',
    )
    expect(html.match(/<svg[^>]*class="ts-chart/gu)?.length).toBe(1)
    expect(html).toContain(
      'aria-label="Running total of gifts by week, one line per year from 2024 to 2026"',
    )
    expect(html.match(/aria-pressed="true"/gu)?.length).toBe(2)
  })

  it('lists the years, this year so far against the same days last year', async () => {
    expect.hasAssertions()

    const html = await firstRender()

    expect(html).toContain('First year')
    expect(html).toContain('so far')
    expect(html).toContain('2026 compares with the same days of 2025')
  })
})
