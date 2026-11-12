import { defineChart, lineY, ruleX } from '@tanstack/charts'
import { crosshair } from '@tanstack/charts/crosshair'
import { Chart } from '@tanstack/charts/react'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { useMemo } from 'react'

import type { Analytics } from '#/modules/analytics'
import { weekOfYear } from '#/modules/analytics'

import { compactCurrency, currency, monthText } from './format'
import { Legend } from './legend'

const YEAR_COLORS = ['var(--color-fg-subtle)', 'var(--color-fg-muted)', 'var(--color-chart-2)']

const TICK_YEAR = 2001

const tickMonth = (month: number) => `${TICK_YEAR}-${String(month).padStart(2, '0')}`

const MONTH_STARTS = Array.from({ length: 12 }, (_, index) =>
  weekOfYear(`${tickMonth(index + 1)}-01`),
)

const monthOfWeek = (week: number) => MONTH_STARTS.filter((start) => start <= week).length

const yearColors = (years: readonly number[]) =>
  years.map((_, index) => YEAR_COLORS[YEAR_COLORS.length - years.length + index] ?? 'currentColor')

export function PaceChart(props: { pace: Analytics['pace'] }) {
  const { lastWeek, points } = props.pace
  const years = useMemo(() => [...new Set(points.map((point) => point.year))], [points])
  const colors = useMemo(() => yearColors(years), [years])

  const definition = useMemo(
    () =>
      defineChart({
        color: { domain: years, range: colors },
        focus: 'group-x',
        marks: [
          ruleX([lastWeek], { strokeDasharray: '2 3', strokeOpacity: 0.6 }),
          lineY(points, { color: 'year', strokeWidth: 2, x: 'week', y: 'cumulative', z: 'year' }),
          crosshair({ x: true, y: false }),
        ],
        scales: {
          x: {
            axis: {
              ticks: {
                format: (week) => monthText(tickMonth(monthOfWeek(week)), false),
                values: MONTH_STARTS,
              },
            },
            scale: () => scaleLinear().domain([1, 53]),
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
            rows: points.map((point) => ({
              color: point.color,
              label: String(point.datum.year),
              value: currency.format(point.datum.cumulative),
            })),
            title: `Week ${points[0]?.datum.week ?? ''}`,
          }),
          use: tooltip,
        },
      }),
    [colors, lastWeek, points, years],
  )

  return (
    <>
      <Chart
        ariaLabel="Running total of gifts by week for this year and the two before"
        className="px-2 pt-2"
        definition={definition}
        height={240}
        initialWidth={720}
      />
      <Legend
        items={years.map((year, index) => ({
          color: colors[index] ?? 'currentColor',
          label: String(year),
          shape: 'line',
        }))}
      >
        <li className="text-fg-subtle">Dashed line: the period&apos;s last day</li>
      </Legend>
    </>
  )
}
