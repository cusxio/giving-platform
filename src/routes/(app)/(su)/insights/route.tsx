import { createFileRoute } from '@tanstack/react-router'

import { config } from '#/core/brand'
import { useSuspenseQueryDeferred } from '#/hooks'
import { cx } from '#/styles/cx'

import { InsightsGivingBreakdown } from './-components/insights-giving-breakdown'
import { InsightsSummary } from './-components/insights-summary'
import { MultiLineChart } from './-components/multi-line-chart'
import { createInsightsQueryOptions } from './-insights.queries'

export const Route = createFileRoute('/(app)/(su)/insights')({
  async loader({ context }) {
    await context.queryClient.ensureQueryData(createInsightsQueryOptions())
  },
  head: () => ({ meta: [{ title: `Insights · ${config.entity}` }] }),
  component: RouteComponent,
})

function RouteComponent() {
  const { data } = useSuspenseQueryDeferred(createInsightsQueryOptions())

  return (
    <div
      className={cx(
        'srhink-0 mx-auto w-full grow p-4',
        'max-w-120 bp-overview-2col:max-w-5xl',
      )}
    >
      <div
        className={cx(
          'grid grid-cols-1 bp-overview-2col:grid-cols-2',
          'bp-overview-2col:gap-2',
          'gap-4 lg:gap-8',
        )}
      >
        <InsightsSummary {...data.summary} />

        <InsightsGivingBreakdown
          userGuest={data.userGuest}
          weekendWeekday={data.weekendWeekday}
        />

        <MultiLineChart
          data={data.weeklyCumulativeTotalsByYear}
          metric="weekly"
        />
        <MultiLineChart
          data={data.weeklyCumulativeTotalsByYear}
          metric="cumulative"
        />
      </div>
    </div>
  )
}
