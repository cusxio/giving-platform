import { QueryClient, QueryClientProvider, queryOptions } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type * as Analytics from '#/modules/analytics'

import type * as Chart from './-components/multi-line-chart'

const chartCode = vi.hoisted(() => ({ loaded: false }))

const insights = {
  summary: { averageAmount: 100, medianAmount: 100, noOfContributions: 1, totalAmount: 100 },
  userGuest: [],
  weekendWeekday: [],
  weeklyCumulativeTotalsByYear: [{ cumulativeAmount: 100, week: 1, weeklyAmount: 100, year: 2026 }],
}

vi.mock<typeof Analytics>(import('#/modules/analytics'), async (actual) => {
  const analytics = await actual()
  return {
    ...analytics,
    insightsQuery: () =>
      queryOptions({
        ...analytics.insightsQuery(),
        queryFn: () => Promise.resolve(insights as never),
      }),
  }
})
vi.mock<typeof Chart>(import('./-components/multi-line-chart'), async (actual) => {
  chartCode.loaded = true
  return actual()
})

const { Route } = await import('./route')

const loader = Route.options.loader as (options: { context: unknown }) => Promise<unknown>
const Page = Route.options.component as () => React.ReactNode

describe('the insights loader', () => {
  it('loads the chart code with the data, not with the route', async () => {
    expect.hasAssertions()
    expect(chartCode.loaded).toBe(false)

    await loader({ context: { queryClient: new QueryClient() } })

    expect(chartCode.loaded).toBe(true)
  })
})

describe('the insights page', () => {
  it('draws its charts in the first render once the loader has run', async () => {
    expect.hasAssertions()
    const queryClient = new QueryClient()
    await loader({ context: { queryClient } })

    const html = renderToString(
      createElement(QueryClientProvider, { client: queryClient }, createElement(Page)),
    )

    expect(html).toContain('Weekly Transactions')
    expect(html).toContain('Cumulative Weekly Transactions')
  })
})
