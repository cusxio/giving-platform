import { defineChart, lineY } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { useMemo } from 'react'

import { ChartContainer, ChartTitle } from '#/components/ui/chart'
import { createCurrencyFormatter } from '#/core/formatters'

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

const YEAR_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-5)',
  'var(--color-chart-4)',
]

const compactCurrency = createCurrencyFormatter({ notation: 'compact' })
const currency = createCurrencyFormatter({ showSymbol: true })

export function MultiLineChart(props: MultiLineChartProps) {
  const { data, metric } = props
  const metricKey = metric === 'weekly' ? 'weeklyAmount' : 'cumulativeAmount'
  const chartTitle = metric === 'weekly' ? 'Weekly Transactions' : 'Cumulative Weekly Transactions'

  const years = useMemo(() => [...new Set(data.map((d) => d.year))], [data])
  const colors = useMemo(
    () => years.map((_, index) => YEAR_COLORS[index % YEAR_COLORS.length] ?? 'currentColor'),
    [years],
  )

  const definition = useMemo(
    () =>
      defineChart({
        color: { domain: years, range: colors },
        focus: 'group-x',
        marks: [
          lineY(data, {
            color: 'year',
            strokeWidth: 1.5,
            x: 'week',
            y: (row) => row[metricKey],
            z: 'year',
          }),
        ],
        scales: {
          x: { axis: { ticks: { format: String } }, scale: scaleLinear },
          y: {
            axis: { ticks: { format: (amount) => compactCurrency.format(amount) } },
            grid: true,
            nice: true,
            scale: scaleLinear,
          },
        },
        tooltip: {
          content: (points) => ({
            rows: points.map((point) => ({
              color: point.color,
              label: String(point.datum.year),
              value: currency.format(point.datum[metricKey]),
            })),
            title: `Week ${points[0]?.datum.week ?? ''}`,
          }),
          use: tooltip,
        },
      }),
    [colors, data, metricKey, years],
  )

  return (
    <ChartContainer>
      <ChartTitle>{chartTitle}</ChartTitle>

      <div className="mt-4 flex items-center justify-center gap-4">
        {years.map((year, index) => (
          <div className="flex items-center gap-x-2" key={year}>
            <span className="h-3 w-3" style={{ backgroundColor: colors[index] }} />
            <span className="text-sm text-fg-subtle">{year}</span>
          </div>
        ))}
      </div>

      <Chart
        ariaLabel={chartTitle}
        aspectRatio={16 / 9}
        className="px-4 pt-4 pb-2"
        definition={definition}
        initialWidth={480}
      />
    </ChartContainer>
  )
}
