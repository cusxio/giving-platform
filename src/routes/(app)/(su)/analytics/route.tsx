import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Suspense, useCallback, useState } from 'react'
import { TZDate } from 'react-day-picker'

import { Error } from '#/components/error'
import type { DateRangePickerProps } from '#/components/ui/date-range-picker'
import { DateRangePicker } from '#/components/ui/date-range-picker'
import { config } from '#/core/brand'
import { useSuspenseQueryDeferred } from '#/hooks/use-suspense-query-deferred'
import type { Analytics } from '#/modules/analytics'
import { analyticsQuery } from '#/modules/analytics'

import { periodSearch } from '../-period-search'

import { Attention } from './-components/attention'
import { DonorsPanel } from './-components/donors-panel'
import { BLOCKS, compactCurrency, percent, rangeText } from './-components/format'
import { FundsPanel } from './-components/funds-panel'
import { KpiRow } from './-components/kpi-row'
import { charts } from './-components/load-charts'
import { paceSummary } from './-components/pace-summary'
import { Panel, Takeaway } from './-components/panel'
import { PaymentsPanel } from './-components/payments-panel'
import { SignedInGuestPanel } from './-components/signed-in-guest-panel'

const MonthlyChart = charts.component((m) => m.MonthlyChart)
const PaceChart = charts.component((m) => m.PaceChart)
const GiftSizesChart = charts.component((m) => m.GiftSizesChart)
const HeatmapChart = charts.component((m) => m.HeatmapChart)

export const Route = createFileRoute('/(app)/(su)/analytics')({
  component: RouteComponent,
  errorComponent: Error,
  head: () => ({ meta: [{ title: `Analytics · ${config.entity}` }] }),

  validateSearch: (search) => periodSearch(search.start, search.end),

  loaderDeps: ({ search }) => ({ end: search.end, start: search.start }),

  async loader({ context, deps }) {
    await Promise.all([
      context.queryClient.query({ ...analyticsQuery(deps), staleTime: 'static' }),
      charts.load(),
    ])
  },
})

const toIsoDate = (date: Date) => date.toLocaleDateString('en-CA')

function ChartSlot(props: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="h-60" />}>{props.children}</Suspense>
}

function giftSizesTakeaway(sizes: Analytics['giftSizes']) {
  const gifts = sizes.reduce((sum, size) => sum + size.gifts, 0)
  const money = sizes.reduce((sum, size) => sum + size.amount, 0)
  const large = sizes.filter((size) => size.band === '500-999' || size.band === '1000-plus')
  if (gifts === 0) {
    return 'No gifts in this period.'
  }
  const largeGifts = large.reduce((sum, size) => sum + size.gifts, 0)
  const largeMoney = large.reduce((sum, size) => sum + size.amount, 0)
  return `Gifts of RM 500 or more are ${percent(largeGifts / gifts)} of gifts and ${percent(largeMoney / money)} of the money.`
}

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function heatmapTakeaway(cells: Analytics['whenPeopleGive']) {
  const total = cells.reduce((sum, cell) => sum + cell.gifts, 0)
  const busiest = cells.reduce((best, cell) => (cell.gifts > best.gifts ? cell : best))
  if (total === 0) {
    return 'No gifts in this period.'
  }
  const until = BLOCKS[(busiest.block + 1) % BLOCKS.length]
  return `${WEEKDAY_NAMES[busiest.weekday - 1]} ${BLOCKS[busiest.block]} to ${until} is the busiest block, with ${percent(busiest.gifts / total)} of gifts.`
}

function paceTakeaway(pace: Analytics['pace']) {
  const summary = paceSummary(pace)
  if (summary === null) {
    return 'Running total from 1 January, against the two years before.'
  }
  const ahead = Math.round(summary.ahead * 100)
  const position =
    ahead === 0
      ? `level with ${summary.lastYear}`
      : `${Math.abs(ahead)}% ${ahead > 0 ? 'ahead of' : 'behind'} ${summary.lastYear}`
  return `${summary.year} is ${position} at this point. At this pace the year ends near ${compactCurrency.format(summary.projected)}.`
}

function RouteComponent() {
  const search = Route.useSearch()
  const { data } = useSuspenseQueryDeferred(analyticsQuery(search))

  const navigate = useNavigate()
  const [range, setRange] = useState<DateRangePickerProps['value']>(() => ({
    from: new TZDate(data.period.start),
    to: new TZDate(data.period.end),
  }))
  const changePeriod: DateRangePickerProps['onChange'] = useCallback(
    (next) => {
      setRange(next)
      navigate({
        search: {
          end: next?.to ? toIsoDate(next.to) : undefined,
          start: next?.from ? toIsoDate(next.from) : undefined,
        },
        to: '/analytics',
      }).catch(console.error)
    },
    [navigate],
  )

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-y-1">
          <h1 className="text-2xl text-fg-1">Analytics</h1>
          <p className="text-sm text-fg-muted">
            {`All donors, ${rangeText(data.period)}, compared with ${rangeText(data.compare)}.`}
          </p>
        </div>
        <DateRangePicker onChange={changePeriod} value={range} />
      </header>

      <Attention attention={data.attention} />

      <KpiRow kpis={data.kpis} />

      <Panel
        aside={<span className="text-xs text-fg-subtle">Tick: the same month last year</span>}
        title="Received each month, by fund"
      >
        <ChartSlot>
          <MonthlyChart data={data} />
        </ChartSlot>
      </Panel>

      <DonorsPanel donors={data.donors} />

      <FundsPanel funds={data.funds} gifts={data.kpis.gifts.value} period={data.period} />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Panel
          aside={<span className="text-xs text-fg-subtle">Running total, January to December</span>}
          title="Pace against past years"
        >
          <Takeaway>{paceTakeaway(data.pace)}</Takeaway>
          <ChartSlot>
            <PaceChart pace={data.pace} />
          </ChartSlot>
        </Panel>
        <SignedInGuestPanel split={data.signedInGuest} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Gift sizes">
          <Takeaway>{giftSizesTakeaway(data.giftSizes)}</Takeaway>
          <ChartSlot>
            <GiftSizesChart giftSizes={data.giftSizes} />
          </ChartSlot>
        </Panel>
        <Panel title="When people give">
          <Takeaway>{heatmapTakeaway(data.whenPeopleGive)}</Takeaway>
          <ChartSlot>
            <HeatmapChart cells={data.whenPeopleGive} />
          </ChartSlot>
        </Panel>
      </div>

      <PaymentsPanel payments={data.payments} />

      <p className="text-xs text-fg-subtle">
        Every number is an aggregate. No donor is named on this page.
      </p>
    </div>
  )
}
