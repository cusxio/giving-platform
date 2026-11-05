import { Suspense } from 'react'

import { ChartFallback } from '#/components/ui/chart'
import type { Overview } from '#/modules/history'
import { cx } from '#/styles/cx'

import { ChartSummary } from '../../-components/charts/chart-summary'
import { charts } from '../../-components/charts/load-charts'

const AreaChart = charts.component((m) => m.AreaChart)
const BarChart = charts.component((m) => m.BarChart)
const StackedBarChart = charts.component((m) => m.StackedBarChart)

interface OverviewChartsProps extends Omit<Overview, 'transactions'> {
  privacyMode: boolean
}

export function OverviewCharts(props: OverviewChartsProps) {
  const {
    summary,
    monthlyContributions,
    monthlyContributionsFrequency,
    cumulativeContributions,
    privacyMode,
  } = props

  return (
    <div
      className={cx(
        'grid grid-cols-1 bp-overview-2col:grid-cols-2',
        'bp-overview-2col:gap-2',
        'gap-4 lg:gap-8',
      )}
    >
      <ChartSummary {...summary} privacyMode={privacyMode} />
      {monthlyContributions.length > 0 && (
        <Suspense fallback={<ChartFallback />}>
          <BarChart data={monthlyContributions} privacyMode={privacyMode} />
        </Suspense>
      )}
      {monthlyContributionsFrequency.length > 0 && (
        <Suspense fallback={<ChartFallback />}>
          <StackedBarChart data={monthlyContributionsFrequency} privacyMode={privacyMode} />
        </Suspense>
      )}
      {(monthlyContributions.length > 0 || monthlyContributionsFrequency.length > 0) && (
        <Suspense fallback={<ChartFallback />}>
          <AreaChart data={cumulativeContributions} privacyMode={privacyMode} />
        </Suspense>
      )}
    </div>
  )
}
