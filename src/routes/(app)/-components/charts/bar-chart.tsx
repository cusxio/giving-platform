import { useCallback } from 'react'
import { Bar, BarChart as RechartBarChart, Tooltip } from 'recharts'
import type { TooltipContentProps } from 'recharts'
import type { CartesianChartProps } from 'recharts/types/util/types'

import { ChartContainer, ChartTitle } from '#/components/ui/chart'
import { clientTz, now } from '#/core/date'
import { createCurrencyFormatter, createDateFormatter } from '#/core/formatters'

import { CartesianGrid } from './cartesian-grid'
import { XAxis } from './x-axis'
import { YAXis } from './y-axis'

interface BarChartProps extends Omit<
  CartesianChartProps,
  'data' | 'margin' | 'responsive'
> {
  data: Data[]
  privacyMode: boolean
}

interface Data {
  month: number
  totalAmount: number
}

type TooltipPayload = { payload: Data }[]

export function BarChart(props: BarChartProps) {
  const { privacyMode, ...rest } = props
  const xTickFormatter = useCallback(
    (value: number) =>
      createDateFormatter({ month: 'short' }).format(
        new Date(value.toString()),
      ),
    [],
  )

  const yTickFormatter = useCallback(
    (value: number) =>
      createCurrencyFormatter({ notation: 'compact' }).format(
        value,
        privacyMode,
      ),
    [privacyMode],
  )

  return (
    <ChartContainer>
      <ChartTitle>Contribution by Month</ChartTitle>
      <RechartBarChart
        margin={{ left: 0, top: 0, bottom: 0, right: 0 }}
        responsive
        {...rest}
      >
        <CartesianGrid />

        <Tooltip content={TooltipContent} cursor={false} useTranslate3d />

        <XAxis dataKey="month" tickFormatter={xTickFormatter} />

        <YAXis tickFormatter={yTickFormatter} />

        <Bar barSize={16} className="fill-chart-1" dataKey="totalAmount" />
      </RechartBarChart>
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
            {createDateFormatter({ month: 'long' }).format(
              now(clientTz).setMonth(current.month - 1),
            )}
          </span>

          <span className="font-mono text-sm">
            {createCurrencyFormatter({ showSymbol: true }).format(
              current.totalAmount,
            )}
          </span>
        </div>
      )}
    </div>
  )
}
