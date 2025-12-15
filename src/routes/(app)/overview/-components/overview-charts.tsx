import { cx } from '#/styles/cx'

import type { GetOverviewDataResponse } from '../-data/overview.get-data.procedure'
import {
  AreaChart,
  BarChart,
  ChartSummary,
  StackedBarChart,
} from '../../-components/charts'

interface OverviewChartsProps extends Omit<
  GetOverviewDataResponse,
  'transactions'
> {
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
      <BarChart data={monthlyContributions} privacyMode={privacyMode} />
      <StackedBarChart
        data={monthlyContributionsFrequency}
        privacyMode={privacyMode}
      />
      <AreaChart data={cumulativeContributions} privacyMode={privacyMode} />
    </div>
  )
}
