import { useCallback, useMemo } from 'react'
import type { TooltipContentProps } from 'recharts'
import { Line, LineChart, Tooltip } from 'recharts'
import type {
  NameType,
  ValueType,
} from 'recharts/types/component/DefaultTooltipContent'

import { ChartContainer, ChartTitle } from '#/components/ui/chart'
import { createCurrencyFormatter } from '#/core/formatters'
import { cx } from '#/styles/cx'

import { CartesianGrid } from '../../../-components/charts/cartesian-grid'
import { XAxis } from '../../../-components/charts/x-axis'
import { YAXis } from '../../../-components/charts/y-axis'

interface Data {
  cumulativeAmount: number
  week: number
  weeklyAmount: number
  year: number
}

interface MultiLineChartProps {
  data: Data[]
  metric: 'cumulative' | 'weekly'
}

type TooltipPayload = { payload: WeeklyData }[]

interface WeeklyData {
  [year: string]: number
  week: number
}

export function MultiLineChart(props: MultiLineChartProps) {
  const { data, metric } = props
  const metricKey: 'cumulativeAmount' | 'weeklyAmount' =
    metric === 'weekly' ? 'weeklyAmount' : 'cumulativeAmount'
  const chartTitle =
    metric === 'weekly'
      ? 'Weekly Transactions'
      : 'Cumulative Weekly Transactions'

  const years = useMemo(() => [...new Set(data.map((d) => d.year))], [data])

  const chartData = useMemo(
    () => convertToWeeklyFormat(data, metricKey),
    [data, metricKey],
  )

  const yTickFormatter = useCallback(
    (value: number) =>
      createCurrencyFormatter({ notation: 'compact' }).format(value),
    [],
  )

  const xTickFormatter = useCallback((value: string) => {
    return Number(value).toString()
  }, [])

  return (
    <ChartContainer>
      <ChartTitle>{chartTitle}</ChartTitle>

      <div className="mt-4 flex items-center justify-center gap-4">
        {years.map((year) => (
          <div className="flex items-center gap-x-2" key={year}>
            <span
              className={cx(
                'h-3 w-3',
                'bg-current',
                getColorForYear(year, years),
              )}
            />
            <span className="text-sm text-fg-subtle">{year}</span>
          </div>
        ))}
      </div>

      <LineChart
        data={chartData}
        margin={{ left: 0, top: 0, bottom: 0, right: 0 }}
        responsive
      >
        <CartesianGrid />

        <Tooltip
          content={(tooltipProps) => (
            <TooltipContent {...tooltipProps} years={years} />
          )}
          cursor={false}
          useTranslate3d
        />

        <XAxis
          dataKey="week"
          interval="equidistantPreserveStart"
          tickFormatter={xTickFormatter}
        />
        <YAXis tickFormatter={yTickFormatter} />

        {years.map((year) => {
          const className = getColorForYear(year, years)
          return (
            <Line
              activeDot={{ className, fill: 'currentColor', strokeWidth: 0 }}
              className={className}
              dataKey={year}
              dot={false}
              key={year}
              stroke="currentColor"
              strokeWidth={1.5}
              type="monotoneX"
            />
          )
        })}
      </LineChart>
    </ChartContainer>
  )
}

function convertToWeeklyFormat(
  data: Data[],
  metricKey: 'cumulativeAmount' | 'weeklyAmount',
): WeeklyData[] {
  // Group data by week
  const weekMap = new Map<number, Map<number, number>>()

  for (const item of data) {
    if (!weekMap.has(item.week)) {
      weekMap.set(item.week, new Map())
    }
    weekMap.get(item.week)?.set(item.year, item[metricKey])
  }

  // Convert to desired format
  const result: WeeklyData[] = []

  for (const [week, yearData] of weekMap.entries()) {
    const weekEntry: WeeklyData = { week }
    for (const [year, amount] of yearData.entries()) {
      weekEntry[year] = amount
    }
    result.push(weekEntry)
  }

  // Sort by week number
  result.sort((a, b) => a.week - b.week)

  return result
}

function getColorForYear(year: number | string, years: (number | string)[]) {
  const chartColors = [
    'text-chart-1',
    'text-chart-2',
    'text-chart-3',
    'text-chart-5',
    'text-chart-4',
  ]
  const index = years.indexOf(year)
  return chartColors[index % chartColors.length]
}

function TooltipContent(
  props: TooltipContentProps<ValueType, NameType> & { years: number[] },
) {
  const payload = props.payload as TooltipPayload

  const current = payload[0]?.payload
  const years = Object.keys(current ?? {}).filter((key) => key !== 'week')

  const currentcyFormatter = useCallback(
    (value: number) =>
      createCurrencyFormatter({ showSymbol: true }).format(value),
    [],
  )

  return (
    <div className="min-w-40 border border-border bg-base-1">
      {current && (
        <>
          <div className="border-b border-border px-4 py-2">
            <span className="text-sm">Week {current.week}</span>
          </div>
          <div className="grid-y-1 grid px-4 py-2">
            {years.map((year) => {
              return (
                <div className="flex items-center gap-x-2" key={year}>
                  <span
                    className={cx(
                      'h-3 w-3',
                      'bg-current',
                      getColorForYear(Number(year), props.years),
                    )}
                  />
                  <div className="flex min-w-0 flex-1 gap-x-2">
                    <span className="text-sm text-fg-muted tabular-nums">
                      {year}
                    </span>
                    <span className="font-mono text-sm">
                      {currentcyFormatter(Number(current[year]))}
                    </span>
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
