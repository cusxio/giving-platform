import { QueryClient, queryOptions } from '@tanstack/react-query'
import { isRedirect } from '@tanstack/react-router'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { clientTz, now } from '#/core/date'
import type * as History from '#/modules/history'

import type * as HeroCharts from './-components/hero-charts'

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

vi.mock<typeof HeroCharts>(import('./-components/hero-charts'), async (actual) => {
  chartCode.loaded = true
  return actual()
})

const { Route } = await import('./route')
const { OverviewFunds } = await import('./-components/overview-funds')
const { OverviewHero } = await import('./-components/overview-hero')
const { AllYearsRhythm, OverviewRhythm } = await import('./-components/overview-rhythm')

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
const overview = { recent: [] }
const yearHero = {
  kind: 'year' as const,
  lastYear: Array.from({ length: 365 }, (_, day) => day * 4.5),
  lastYearSameDay: 450,
  thisYear: Array.from({ length: 101 }, (_, day) => day * 12.34),
  today: 100,
  total: 1234,
  year: 2026,
}
type AllHero = Extract<History.Overview['hero'], { kind: 'all' }>
const pace2026 = {
  runningTotals: Array.from({ length: 101 }, (_, day) => day * 12.34),
  total: 1234,
  year: 2026,
}
const pace2025 = {
  runningTotals: Array.from({ length: 365 }, (_, day) => (day <= 100 ? day * 4.5 : 2222.22)),
  total: 2222.22,
  year: 2025,
}
const allHero: AllHero = {
  kind: 'all',
  lastYearSameDay: 450,
  since: new Date('2024-12-01T00:00:00Z'),
  today: 100,
  total: 3456.78,
  years: [pace2026, pace2025],
}
const funds = [{ amount: 3456.78, fundName: 'Tithe', share: 1 }]
const gave = (total: number) => ({ state: 'given' as const, total })
const months = (
  ...states: ({ state: 'given'; total: number } | 'before' | 'noGift' | 'notYet')[]
) =>
  states.map((state, i) =>
    typeof state === 'string'
      ? { month: i + 1, state }
      : { month: i + 1, state: state.state, total: state.total },
  )
const repeat = <T>(count: number, value: T) => Array.from({ length: count }, () => value)
const rhythm = {
  gifts: 7,
  kind: 'year' as const,
  largest: { amount: 2234.56, date: new Date('2026-03-01T00:00:00Z'), funds: ['Tithe'] },
  months: months(...repeat(4, gave(432.1)), ...repeat(8, 'notYet' as const)),
  monthsGiven: 4,
  monthsSoFar: 4,
  usualGift: 432.1,
}
const allRhythm = {
  firstGift: new Date('2025-12-01T00:00:00Z'),
  gifts: 3,
  kind: 'all' as const,
  largest: { amount: 2234.56, date: new Date('2026-01-04T00:00:00Z'), funds: ['Tithe'] },
  monthsGiven: 2,
  monthsSoFar: 3,
  usualGift: 432.1,
  years: [
    { months: months(gave(450), 'noGift', ...repeat(10, 'notYet' as const)), year: 2026 },
    { months: months(...repeat(11, 'before' as const), gave(321)), year: 2025 },
  ],
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

function renderAmounts(privacyMode: boolean) {
  return [
    createElement(OverviewHero, { hero: yearHero, privacyMode }),
    createElement(OverviewHero, { hero: allHero, privacyMode }),
    createElement(OverviewFunds, { funds, privacyMode }),
    createElement(OverviewRhythm, { isCurrentYear: true, privacyMode, rhythm, year: 2026 }),
    createElement(AllYearsRhythm, { privacyMode, rhythm: allRhythm }),
  ]
    .map((element) => renderToString(element))
    .join('')
}

const svgText = (html: string) =>
  [...html.matchAll(/<text[^>]*>(?<label>[^<]*)<\/text>/gu)].map((m) => m.groups?.label ?? '')
const visibleText = (html: string) => html.replaceAll(/<[^>]*>/gu, ' ').replaceAll(/\s+/gu, ' ')

async function loadCharts() {
  given(
    () => Promise.resolve([thisYear]),
    () => Promise.resolve(overview),
  )
  await load({})
}

describe('the overview charts', () => {
  it('draw in the first render once the loader has run', async () => {
    expect.hasAssertions()
    await loadCharts()

    const html = renderAmounts(false)

    expect(html).toContain('Running total for 2026 compared with 2025')
    expect(html).toContain('Running total within each year, 2025 to 2026')
    expect(svgText(html)).toStrictEqual(expect.arrayContaining(['Jan', 'Dec']))
    expect(visibleText(html)).toMatch(/2026 RM\s1,234 .*2025 RM\s2,222\.22/u)
  })

  it('hide every amount in privacy mode, axis ticks and legend totals included', async () => {
    expect.hasAssertions()
    await loadCharts()

    const html = renderAmounts(true)

    expect(visibleText(html)).not.toMatch(/1,234|3,456|2,234|2,222|1,222|432|321|450|\d(?:\.\d)?K/u)
    expect(svgText(html).filter((label) => /\d/u.test(label))).toStrictEqual([])
    expect(html).toContain('RM —')
  })
})

const heroWords = (hero: AllHero) =>
  visibleText(renderToString(createElement(OverviewHero, { hero, privacyMode: false })))
const rhythmWords = (privacyMode: boolean) =>
  visibleText(renderToString(createElement(AllYearsRhythm, { privacyMode, rhythm: allRhythm })))

describe('the all-years hero', () => {
  it('compares this year with last year by the same date', async () => {
    expect.hasAssertions()
    await loadCharts()

    expect(heroWords(allHero)).toContain('2026 is 174% ahead of this time last year (RM 450)')
  })

  it("says so once this year's gifts pass all of last year's", async () => {
    expect.hasAssertions()
    await loadCharts()
    const passed = heroWords({ ...allHero, years: [pace2026, { ...pace2025, total: 1000 }] })

    expect(passed).toContain('2026 has already passed all of 2025')
    expect(passed).not.toContain('this time last year')
  })

  it('picks the current year until another is chosen', async () => {
    expect.hasAssertions()
    await loadCharts()

    const html = renderToString(createElement(OverviewHero, { hero: allHero, privacyMode: false }))

    expect(html).toMatch(/aria-pressed="true"[^>]*>(?:<[^>]*>)*2026/u)
    expect(html).toMatch(/aria-pressed="false"[^>]*>(?:<[^>]*>)*2025/u)
  })
})

describe('the all-years rhythm', () => {
  it('counts the months given since the first gift', () => {
    expect.hasAssertions()

    expect(rhythmWords(false)).toContain('You gave in 2 of 3 months since December 2025')
  })

  it('names each month with its year and amount, or why it has none', () => {
    expect.hasAssertions()

    const text = rhythmWords(false)

    expect(text).toContain('January 2026: RM 450')
    expect(text).toContain('February 2026: no gift')
    expect(text).toContain('March 2026: not yet')
    expect(text).toContain('November 2025: before your first gift')
    expect(text).toContain('December 2025: RM 321')
  })

  it('shows the first gift and the largest, with its date and funds', () => {
    expect.hasAssertions()

    expect(rhythmWords(false)).toMatch(
      /First gift 1 Dec 2025 .*Largest gift RM 2,234\.56 4 Jan 2026 ?, Tithe/u,
    )
  })
})
