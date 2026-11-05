import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'

import { ChartFallback } from '#/components/ui/chart'
import { config } from '#/core/brand'
import { useSuspenseQueryDeferred } from '#/hooks/use-suspense-query-deferred'
import { insightsQuery } from '#/modules/analytics'
import { cx } from '#/styles/cx'

import { InsightsGivingBreakdown } from './-components/insights-giving-breakdown'
import { InsightsSummary } from './-components/insights-summary'
import { multiLineChart } from './-components/load-multi-line-chart'

const MultiLineChart = multiLineChart.component((m) => m.MultiLineChart)

export const Route = createFileRoute('/(app)/(su)/insights')({
  component: RouteComponent,
  head: () => ({ meta: [{ title: `Insights · ${config.entity}` }] }),
  async loader({ context }) {
    await Promise.all([
      context.queryClient.query({ ...insightsQuery(), staleTime: 'static' }),
      multiLineChart.load(),
    ])
  },
})

function RouteComponent() {
  const { data } = useSuspenseQueryDeferred(insightsQuery())

  return (
    <div className={cx('srhink-0 mx-auto w-full grow p-4', 'max-w-120 bp-overview-2col:max-w-5xl')}>
      <div
        className={cx(
          'grid grid-cols-1 bp-overview-2col:grid-cols-2',
          'bp-overview-2col:gap-2',
          'gap-4 lg:gap-8',
        )}
      >
        <InsightsSummary {...data.summary} />

        <InsightsGivingBreakdown userGuest={data.userGuest} weekendWeekday={data.weekendWeekday} />

        <Suspense fallback={<ChartFallback legend />}>
          <MultiLineChart data={data.weeklyCumulativeTotalsByYear} metric="weekly" />
        </Suspense>
        <Suspense fallback={<ChartFallback legend />}>
          <MultiLineChart data={data.weeklyCumulativeTotalsByYear} metric="cumulative" />
        </Suspense>
      </div>
    </div>
  )
}
