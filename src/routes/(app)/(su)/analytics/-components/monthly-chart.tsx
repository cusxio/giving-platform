import { barY, defineChart, tickY } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { useMemo } from 'react'

import type { Analytics } from '#/modules/analytics'

import { compactCurrency, currency, fundColor, monthText, monthsOf } from './format'
import { Legend } from './legend'

const LAST_YEAR_COLOR = 'var(--color-chart-2)'

interface MonthlyChartProps {
  data: Pick<Analytics, 'monthly' | 'monthlyLastYear' | 'period'>
}

export function MonthlyChart(props: MonthlyChartProps) {
  const { monthly, monthlyLastYear, period } = props.data

  const fundNames = useMemo(() => [...new Set(monthly.map((row) => row.fundName))], [monthly])

  const definition = useMemo(() => {
    const months = monthsOf(period)
    const withYear = period.start.slice(0, 4) !== period.end.slice(0, 4)
    const lastYear = monthlyLastYear.filter((row) => months.includes(row.month))
    return defineChart({
      color: { domain: fundNames, range: fundNames.map((name) => fundColor(name)) },
      focus: 'group-x',
      marks: [
        barY(monthly, { color: 'fundName', x: 'month', y: 'amount' }),
        tickY(lastYear, { stroke: LAST_YEAR_COLOR, strokeWidth: 2, x: 'month', y: 'amount' }),
      ],
      scales: {
        x: {
          axis: { ticks: { format: (month) => monthText(month, withYear) } },
          scale: () => scaleBand().domain(months).padding(0.3),
        },
        y: {
          axis: { ticks: { format: (amount) => compactCurrency.format(amount) } },
          grid: true,
          nice: true,
          scale: scaleLinear,
        },
      },
      tooltip: {
        content: (points) => ({
          rows: points.map((point) =>
            'fundName' in point.datum
              ? {
                  color: point.color,
                  label: point.datum.fundName,
                  value: currency.format(point.datum.amount),
                }
              : {
                  color: LAST_YEAR_COLOR,
                  label: 'Same month last year',
                  value: currency.format(point.datum.amount),
                },
          ),
          title: monthText(points[0]?.xValue ?? '', true),
        }),
        use: tooltip,
      },
    })
  }, [fundNames, monthly, monthlyLastYear, period])

  return (
    <>
      <Chart
        ariaLabel="Money received each month by fund, with the same month last year"
        className="px-2 pt-2"
        definition={definition}
        height={240}
        initialWidth={720}
      />
      <Legend
        items={[
          ...fundNames.map((name) => ({ color: fundColor(name), label: name })),
          { color: LAST_YEAR_COLOR, label: 'Same month last year', shape: 'line' as const },
        ]}
      />
    </>
  )
}
