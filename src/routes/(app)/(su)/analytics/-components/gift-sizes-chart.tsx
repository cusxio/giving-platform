import { barY, defineChart, group } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { useMemo } from 'react'

import type { Analytics, GiftBand } from '#/modules/analytics'

import { count } from './format'
import { Legend } from './legend'

const BAND_LABELS: Record<GiftBand, string> = {
  '100-199': '100 to 199',
  '1000-plus': '1,000+',
  '200-499': '200 to 499',
  '50-99': '50 to 99',
  '500-999': '500 to 999',
  'under-50': 'Under 50',
}

const SERIES = ['This period', 'Same days last year']
const SERIES_COLORS = ['var(--color-chart-2)', 'var(--color-fg-subtle)']

export function GiftSizesChart(props: { giftSizes: Analytics['giftSizes'] }) {
  const { giftSizes } = props

  const definition = useMemo(() => {
    const rows = giftSizes.flatMap((size) => [
      { band: BAND_LABELS[size.band], gifts: size.gifts, series: 'This period' },
      { band: BAND_LABELS[size.band], gifts: size.priorGifts, series: 'Same days last year' },
    ])
    return defineChart({
      color: { domain: SERIES, range: SERIES_COLORS },
      focus: 'group-x',
      marks: [
        barY(rows, { color: 'series', layout: group({ padding: 0.1 }), x: 'band', y: 'gifts' }),
      ],
      scales: {
        x: {
          scale: () =>
            scaleBand()
              .domain(giftSizes.map((size) => BAND_LABELS[size.band]))
              .padding(0.25),
        },
        y: { axis: { ticks: { format: String } }, grid: true, nice: true, scale: scaleLinear },
      },
      tooltip: {
        content: (points) => ({
          rows: points.map((point) => ({
            color: point.color,
            label: point.datum.series,
            value: `${count.format(point.datum.gifts)} gifts`,
          })),
          title: `RM ${points[0]?.datum.band ?? ''}`,
        }),
        use: tooltip,
      },
    })
  }, [giftSizes])

  return (
    <>
      <Chart
        ariaLabel="Gifts by size in ringgit, this period against the same days last year"
        className="px-2 pt-2"
        definition={definition}
        height={220}
        initialWidth={480}
      />
      <Legend
        items={SERIES.map((label, index) => ({
          color: SERIES_COLORS[index] ?? 'currentColor',
          label,
        }))}
      >
        <li className="text-fg-subtle">Ringgit per gift</li>
      </Legend>
    </>
  )
}
