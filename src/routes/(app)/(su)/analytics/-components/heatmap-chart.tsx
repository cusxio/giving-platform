import { cell, defineChart } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleBand } from '@tanstack/charts/scales/band'
import { tooltip } from '@tanstack/charts/tooltip'
import { useMemo } from 'react'

import type { Analytics } from '#/modules/analytics'

import { BLOCKS, WEEKDAYS, count } from './format'

/** Five steps from none to the busiest block, so colour reads as "fewer" to "more". */
const LEVELS = [0, 1, 2, 3, 4]
const LEVEL_COLORS = [
  'var(--color-elevated)',
  'color-mix(in oklab, var(--color-chart-2) 25%, var(--color-elevated))',
  'color-mix(in oklab, var(--color-chart-2) 50%, var(--color-elevated))',
  'color-mix(in oklab, var(--color-chart-2) 75%, var(--color-elevated))',
  'var(--color-chart-2)',
]

const levelOf = (gifts: number, busiest: number) =>
  gifts === 0 || busiest === 0 ? 0 : Math.ceil((gifts / busiest) * 4)

export function HeatmapChart(props: { cells: Analytics['whenPeopleGive'] }) {
  const { cells } = props

  const definition = useMemo(() => {
    const busiest = Math.max(0, ...cells.map((one) => one.gifts))
    const rows = cells.map((one) => ({
      block: BLOCKS[one.block] ?? '',
      gifts: one.gifts,
      level: levelOf(one.gifts, busiest),
      weekday: WEEKDAYS[one.weekday - 1] ?? '',
    }))
    return defineChart({
      color: { domain: LEVELS, range: LEVEL_COLORS },
      marks: [
        cell(rows, {
          color: 'level',
          inset: 1.5,
          key: (row) => `${row.weekday}-${row.block}`,
          radius: 3,
          x: 'block',
          y: 'weekday',
        }),
      ],
      scales: {
        x: { scale: () => scaleBand().domain(BLOCKS).padding(0) },
        y: { scale: () => scaleBand().domain(WEEKDAYS).padding(0) },
      },
      tooltip: {
        content: (points) => ({
          rows: points.map((point) => ({
            label: `${point.datum.weekday} from ${point.datum.block}`,
            value: `${count.format(point.datum.gifts)} gifts`,
          })),
        }),
        use: tooltip,
      },
    })
  }, [cells])

  return (
    <>
      <Chart
        ariaLabel="Gifts by weekday and three-hour block, Kuala Lumpur time"
        className="px-2 pt-2"
        definition={definition}
        height={240}
        initialWidth={480}
      />
      <div className="flex items-center gap-x-1.5 px-4 pb-3 text-xs text-fg-subtle">
        Fewer
        {LEVEL_COLORS.map((color) => (
          <span
            aria-hidden
            className="size-2.5 rounded-xs"
            key={color}
            style={{ backgroundColor: color }}
          />
        ))}
        More
        <span className="ml-auto">Kuala Lumpur time</span>
      </div>
    </>
  )
}
