import { defineChart, lineY, ruleX } from '@tanstack/charts'
import { crosshair } from '@tanstack/charts/crosshair'
import { Chart } from '@tanstack/charts/react'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { useMemo } from 'react'

import type { EveryYear } from '#/modules/analytics'
import { weekOfYear } from '#/modules/analytics'

import { compactCurrency, currency, monthText } from './format'
import type { PaceView } from './pace-view'
import { yearColor } from './pace-view'

const TICK_YEAR = 2001

const tickMonth = (month: number) => `${TICK_YEAR}-${String(month).padStart(2, '0')}`

const MONTH_STARTS = Array.from({ length: 12 }, (_, index) =>
  weekOfYear(`${tickMonth(index + 1)}-01`),
)

const monthOfWeek = (week: number) => MONTH_STARTS.filter((start) => start <= week).length

interface PaceChartProps {
  lastWeek: number
  points: EveryYear['pace']['points']
  shown: readonly number[]
  view: PaceView
}

export function PaceChart(props: PaceChartProps) {
  const { lastWeek, points, shown, view } = props

  const definition = useMemo(() => {
    const visible = points.filter((point) => shown.includes(point.year))
    const amountOf = (point: (typeof points)[number]) =>
      view.measure === 'cumulative' ? point.cumulative : point.weekly
    return defineChart({
      focus: 'group-x',
      marks: [
        ruleX(shown.includes(view.thisYear) ? [lastWeek] : [], {
          strokeDasharray: '2 3',
          strokeOpacity: 0.6,
        }),
        lineY(
          visible.filter((point) => point.year !== view.picked),
          {
            stroke: (point) => yearColor(point.year, view),
            strokeDasharray: view.measure === 'weekly' ? '4 4' : 'none',
            strokeWidth: 1.5,
            x: 'week',
            y: amountOf,
            z: 'year',
          },
        ),
        lineY(
          visible.filter((point) => point.year === view.picked),
          {
            stroke: yearColor(view.picked, view),
            strokeWidth: 2.5,
            x: 'week',
            y: amountOf,
            z: 'year',
          },
        ),
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
          scale: () => scaleLinear().domain([1, 52]),
        },
        y: {
          axis: { ticks: { format: (amount) => compactCurrency.format(amount) } },
          grid: true,
          nice: true,
          scale: scaleLinear,
        },
      },
      tooltip: {
        content: (focused) => ({
          rows: focused
            .map((point) => point.datum)
            // oxlint-disable-next-line unicorn/no-array-sort -- Avoid toSorted until the runtime lib supports it.
            .sort((a, b) => b.year - a.year)
            .map((datum) => ({
              color: yearColor(datum.year, view),
              label: String(datum.year),
              value: currency.format(amountOf(datum)),
            })),
          title: `Week ${focused[0]?.datum.week ?? ''}`,
        }),
        use: tooltip,
      },
    })
  }, [lastWeek, points, shown, view])

  return (
    <Chart
      ariaLabel={
        view.measure === 'cumulative'
          ? `Running total of gifts by week, one line per year from ${shown[0] ?? ''} to ${shown.at(-1) ?? ''}`
          : `Gifts received each week in ${shown.join(' and ')}`
      }
      className="px-2 pt-2"
      definition={definition}
      height={260}
      initialWidth={720}
    />
  )
}
