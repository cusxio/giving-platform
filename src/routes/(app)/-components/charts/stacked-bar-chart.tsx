import { useCallback } from 'react'
import { Bar, BarChart, Tooltip } from 'recharts'
import type { TooltipContentProps } from 'recharts'
import type { CartesianChartProps } from 'recharts/types/util/types'

import { ChartContainer, ChartTitle } from '#/components/ui/chart'
import { funds } from '#/core/brand'
import { FUND_CHART_COLOR_MAP } from '#/core/brand/funds'
import { clientTz, now } from '#/core/date'
import { createDateFormatter, REDACTED_VALUE } from '#/core/formatters'
import { cx } from '#/styles/cx'

import { CartesianGrid } from './cartesian-grid'
import { XAxis } from './x-axis'
import { YAXis } from './y-axis'

interface Data {
  [fund: string]: number
  month: number
}

interface StackedBarChartProps extends Omit<
  CartesianChartProps,
  'data' | 'margin' | 'responsive'
> {
  data: Data[]
  privacyMode: boolean
}

type TooltipPayload = { payload: Data }[]

export function StackedBarChart(props: StackedBarChartProps) {
  const { privacyMode, ...rest } = props

  const xTickFormatter = useCallback(
    (value: number) =>
      createDateFormatter({ month: 'short' }).format(
        new Date(value.toString()),
      ),
    [],
  )

  const yTickFormatter = useCallback(
    (value: number) => {
      if (privacyMode) {
        return REDACTED_VALUE
      }
      return value.toString()
    },
    [privacyMode],
  )

  return (
    <ChartContainer>
      <ChartTitle>Contribution Activity</ChartTitle>
      <BarChart
        margin={{ left: 0, top: 0, bottom: 0, right: 0 }}
        responsive
        {...rest}
      >
        <CartesianGrid />

        <XAxis dataKey="month" tickFormatter={xTickFormatter} />

        <YAXis tickFormatter={yTickFormatter} />

        {funds.map((fund) => (
          <Bar
            barSize={16}
            className={cx(FUND_CHART_COLOR_MAP[fund], 'fill-current')}
            dataKey={fund.charAt(0).toUpperCase() + fund.slice(1)}
            key={fund}
            stackId="funds"
          />
        ))}

        <Tooltip content={TooltipContent} cursor={false} useTranslate3d />
      </BarChart>
    </ChartContainer>
  )
}

function TooltipContent(props: TooltipContentProps<number, string>) {
  const payload = props.payload as TooltipPayload
  const current = payload[0]?.payload

  const funds = Object.keys(current ?? {}).filter((key) => key !== 'month')

  return (
    <div className="min-w-40 border border-border bg-base-1">
      {current && (
        <>
          <div className="border-b border-border px-4 py-2">
            <span className="text-sm">
              {createDateFormatter({ month: 'long' }).format(
                now(clientTz).setMonth(current.month - 1),
              )}
            </span>
          </div>
          <div className="grid-y-1 grid px-4 py-2">
            {funds.map((fund) => {
              return (
                <div className="flex items-center gap-x-2" key={fund}>
                  <span
                    className={cx(
                      'h-3 w-3',
                      FUND_CHART_COLOR_MAP[
                        fund.toLowerCase() as keyof typeof FUND_CHART_COLOR_MAP
                      ],
                      'bg-current',
                    )}
                  />
                  <div className="flex min-w-0 flex-1 justify-between">
                    <span className="text-sm text-fg-muted">{fund}</span>
                    <span className="font-mono text-sm">{current[fund]}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
