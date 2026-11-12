import { QueryClient, QueryClientProvider, queryOptions } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type * as AnalyticsModule from '#/modules/analytics'
import type { Analytics } from '#/modules/analytics'

import type * as Charts from './-components/charts'

const chartCode = vi.hoisted(() => ({ loaded: false }))

const analytics: Analytics = {
  attention: { held: 2, stalePending: 0 },
  compare: { end: '2025-11-10', start: '2025-01-01' },
  donors: {
    change: { less: 3, more: 5, same: 4 },
    gaveAgain: {
      firstTime: { gaveAgain: 2, of: 3 },
      repeat: null,
      window: { end: '2025-11-10', start: '2024-11-11' },
    },
    notYet: 7,
    regular: { donors: 4, minMonths: 6, shareOfMoney: 0.71 },
    segments: { cameBack: 1, new: 2, returning: 12 },
  },
  funds: [{ amount: 500, fundName: 'Tithe', gifts: 4, guest: 100, prior: 400, signedIn: 400 }],
  giftSizes: [
    { amount: 500, band: '500-999', gifts: 1, priorAmount: 0, priorGifts: 0 },
    { amount: 0, band: 'under-50', gifts: 0, priorAmount: 30, priorGifts: 1 },
  ],
  kpis: {
    donors: { prior: 10, value: 15 },
    gaveAgain: { prior: null, value: { gaveAgain: 2, of: 3 } },
    gifts: { prior: 3, value: 4 },
    medianGift: { prior: 100, value: 125 },
    received: { prior: 400, value: 500 },
  },
  monthly: [{ amount: 500, fundName: 'Tithe', month: '2026-03' }],
  monthlyLastYear: [{ amount: 400, month: '2026-03' }],
  payments: [{ cancelled: 1, failed: 1, method: 'CC', succeeded: 4 }],
  period: { end: '2026-11-10', start: '2026-01-01' },
  signedInGuest: { guest: { amount: 100, gifts: 1 }, user: { amount: 400, gifts: 3 } },
  whenPeopleGive: [{ block: 3, gifts: 4, weekday: 7 }],
}

vi.mock<typeof AnalyticsModule>(import('#/modules/analytics'), async (actual) => {
  const module = await actual()
  return {
    ...module,
    analyticsQuery: (search) =>
      queryOptions({ ...module.analyticsQuery(search), queryFn: () => Promise.resolve(analytics) }),
  }
})
vi.mock<typeof Charts>(import('./-components/charts'), async (actual) => {
  chartCode.loaded = true
  return actual()
})

const { Route } = await import('./period')

const loader = Route.options.loader as (options: {
  context: unknown
  deps: unknown
}) => Promise<unknown>
const Page = Route.options.component as () => React.ReactNode
const DEPS = { end: undefined, start: undefined }

vi.spyOn(Route, 'useSearch').mockReturnValue(DEPS)

describe('the period loader', () => {
  it('loads the chart code with the data, not with the route', async () => {
    expect.hasAssertions()
    expect(chartCode.loaded).toBe(false)

    await loader({ context: { queryClient: new QueryClient() }, deps: DEPS })

    expect(chartCode.loaded).toBe(true)
  })
})

describe('the period tab', () => {
  it('draws every section and chart in the first render once the loader has run', async () => {
    expect.hasAssertions()
    const queryClient = new QueryClient()
    await loader({ context: { queryClient }, deps: DEPS })

    const html = renderToString(
      createElement(QueryClientProvider, { client: queryClient }, createElement(Page)),
    )

    expect(html).toContain('1 Jan to 10 Nov 2026, compared with 1 Jan to 10 Nov 2025')
    expect(html).toContain('2 payments are held. Resolve them at eGHL.')
    expect(html).toContain('2 of 3')
    expect(html.match(/<svg[^>]*class="ts-chart/gu)?.length).toBe(3)
    expect(html).toContain('Gifts of RM 500 or more are 100% of gifts and 100% of the money.')
  })
})
