import { ChartLineUpIcon } from '@phosphor-icons/react/dist/ssr'
import { useCallback } from 'react'
import type { TooltipContentProps } from 'recharts'
import { Area, AreaChart as RechartAreaChart, Tooltip } from 'recharts'
import type { CartesianChartProps } from 'recharts/types/util/types'

import { ChartContainer, ChartTitle } from '#/components/ui/chart'
import { clientTz, TZDate } from '#/core/date'
import { createCurrencyFormatter, createDateFormatter } from '#/core/formatters'

import { CartesianGrid } from './cartesian-grid'
import { XAxis } from './x-axis'
import { YAXis } from './y-axis'

interface AreaChartProps extends Omit<
  CartesianChartProps,
  'data' | 'margin' | 'responsive'
> {
  data: Data[]
  privacyMode: boolean
}

interface Data {
  cumulativeAmount: number
  day: string
}

type TooltipPayload = { payload: Data }[]

export function AreaChart(props: AreaChartProps) {
  const { privacyMode, data, ...rest } = props
  const yTickFormatter = useCallback(
    (value: number) =>
      createCurrencyFormatter({ notation: 'compact' }).format(
        value,
        privacyMode,
      ),
    [privacyMode],
  )

  const xTickFormatter = useCallback((value: string) => {
    return createDateFormatter({ month: 'short', year: '2-digit' }).format(
      new TZDate(value, clientTz),
    )
  }, [])

  return (
    <ChartContainer>
      <ChartTitle>Cumulative Contribution</ChartTitle>
      {data.length >= 2 ? (
        <RechartAreaChart
          data={data}
          margin={{ left: 0, top: 0, bottom: 0, right: 0 }}
          responsive
          {...rest}
        >
          <CartesianGrid />

          <Tooltip content={TooltipContent} cursor={false} useTranslate3d />

          <defs>
            <linearGradient
              className="text-chart-1"
              id="area-chart-gradient"
              x1="0"
              x2="0"
              y1="0"
              y2="1"
            >
              <stop offset="5%" stopColor="currentColor" stopOpacity={0.5} />
              <stop offset="95%" stopColor="currentColor" stopOpacity={0.1} />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="day"
            interval="equidistantPreserveStart"
            tickFormatter={xTickFormatter}
          />

          <YAXis tickFormatter={yTickFormatter} />

          <Area
            activeDot={{ fill: 'var(--bg-base-1)', stroke: 'currentColor' }}
            className="text-chart-1"
            dataKey="cumulativeAmount"
            fill="url(#area-chart-gradient)"
            fillOpacity={0.4}
            stroke="currentColor"
            strokeDasharray="3 3"
            type="monotoneX"
          />
        </RechartAreaChart>
      ) : (
        <div className="flex grow flex-col items-center justify-center gap-y-4 p-4">
          <ChartLineUpIcon className="text-fg-subtle" size={24} />
          <p className="text-center text-sm text-balance text-fg-muted md:text-base">
            Your cumulative trend will appear once you have contributions on at
            least two different days.
          </p>
        </div>
      )}
    </ChartContainer>
  )
}

function TooltipContent(props: TooltipContentProps<number, string>) {
  const payload = props.payload as TooltipPayload

  const current = payload[0]?.payload

  return (
    <div className="border border-border bg-base-1 px-4 py-2">
      {current && (
        <div className="flex items-center justify-between gap-x-4">
          <span className="text-sm text-fg-muted">
            {createDateFormatter({ month: 'long', year: 'numeric' }).format(
              new Date(current.day),
            )}
          </span>

          <span className="font-mono text-sm">
            {createCurrencyFormatter({ showSymbol: true }).format(
              current.cumulativeAmount,
            )}
          </span>
        </div>
      )}
    </div>
  )
}
