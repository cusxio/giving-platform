import { areaY, barY, defineChart, dot, lineY, ruleX, text } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { useMemo } from 'react'

import { TZDate, clientTz, differenceInDays } from '#/core/date'
import { createCurrencyFormatter, monthLabel } from '#/core/formatters'

import { dayMonth, money } from './format'

const compact = createCurrencyFormatter({ notation: 'compact' })

const THIS_YEAR = 'var(--color-chart-1)'
const LAST_YEAR = 'var(--color-fg-subtle)'

interface DayTotal {
  day: number
  total: number
  year: number
}

interface YearChartProps {
  lastYear: readonly number[] | null
  privacyMode: boolean
  thisYear: readonly number[]
  /** Today's day index, when the year is the current one. */
  today: number | null
  year: number
}

const toRows = (totals: readonly number[], year: number): DayTotal[] =>
  totals.map((total, day) => ({ day, total, year }))

/** Running totals of a year against last year by the same date, on one day axis. */
export function YearChart(props: YearChartProps) {
  const { lastYear, privacyMode, thisYear, today, year } = props

  const definition = useMemo(() => {
    const jan1 = new TZDate(year, 0, 1, clientTz)
    const days = differenceInDays(new TZDate(year + 1, 0, 1, clientTz), jan1)
    const monthStarts = Array.from({ length: 12 }, (_, month) =>
      differenceInDays(new TZDate(year, month, 1, clientTz), jan1),
    )
    const monthOf = new Map(monthStarts.map((day, month) => [day, month + 1]))
    const current = toRows(thisYear, year)
    const previous = lastYear ? toRows(lastYear, year - 1) : []
    const latest = current.at(-1)

    return defineChart({
      focus: 'group-x',
      marks: [
        areaY(current, { fill: THIS_YEAR, fillOpacity: 0.08, x: 'day', y1: 0, y2: 'total' }),
        lineY(previous, {
          stroke: LAST_YEAR,
          strokeDasharray: '5 5',
          strokeWidth: 1.5,
          x: 'day',
          y: 'total',
        }),
        lineY(current, { stroke: THIS_YEAR, strokeWidth: 2.5, x: 'day', y: 'total' }),
        ruleX(today === null ? [] : [today], { stroke: LAST_YEAR, strokeDasharray: '2 3' }),
        dot(today === null || latest === undefined ? [] : [latest], {
          fill: THIS_YEAR,
          r: 4,
          x: 'day',
          y: 'total',
        }),
      ],
      scales: {
        x: {
          axis: {
            ticks: {
              format: (day) => monthLabel(monthOf.get(day) ?? 1, 'short'),
              values: monthStarts,
            },
          },
          scale: scaleLinear().domain([0, days - 1]),
        },
        y: {
          axis: { ticks: { count: 3, format: (amount) => compact.format(amount, privacyMode) } },
          grid: true,
          nice: true,
          scale: scaleLinear,
        },
      },
      tooltip: {
        content: (points) => {
          // The area, line and dot of one year each answer for the same day.
          const rows = [...new Map(points.map((point) => [point.datum.year, point])).values()]
          const day = rows[0]?.datum.day ?? 0
          return {
            rows: rows.map((point) => ({
              color: point.datum.year === year ? THIS_YEAR : LAST_YEAR,
              label: String(point.datum.year),
              value: money(point.datum.total, privacyMode),
            })),
            title: dayMonth.format(new TZDate(year, 0, 1 + day, clientTz)),
          }
        },
        use: tooltip,
      },
    })
  }, [lastYear, privacyMode, thisYear, today, year])

  return (
    <Chart
      ariaLabel={
        lastYear
          ? `Running total for ${year} compared with ${year - 1}`
          : `Running total for ${year}`
      }
      className="px-4 pt-2 pb-2"
      definition={definition}
      height={200}
      initialWidth={640}
    />
  )
}

interface YearsChartProps {
  privacyMode: boolean
  years: readonly { total: number; year: number }[]
}

/** Each year's total, the latest year highlighted, labelled directly above its bar. */
export function YearsChart(props: YearsChartProps) {
  const { privacyMode, years } = props

  const definition = useMemo(() => {
    const latest = years.at(-1)?.year
    const top = Math.max(1, ...years.map((row) => row.total))
    return defineChart({
      focus: false,
      margin: { top: 24 },
      marks: [
        barY(years, {
          fill: (row) => (row.year === latest ? THIS_YEAR : LAST_YEAR),
          maxThickness: 96,
          radius: 2,
          x: (row) => String(row.year),
          y: 'total',
        }),
        text(years, {
          dy: -10,
          fill: 'var(--color-fg-muted)',
          fontSize: 12,
          text: (row) => money(row.total, privacyMode),
          x: (row) => String(row.year),
          y: 'total',
        }),
      ],
      scales: {
        x: { axis: { ticks: { size: 0 } }, scale: () => scaleBand().padding(0.3) },
        y: { axis: false, scale: scaleLinear().domain([0, top]) },
      },
    })
  }, [privacyMode, years])

  return (
    <Chart
      ariaLabel="Total given each year"
      className="px-4 pt-2 pb-2"
      definition={definition}
      height={200}
      initialWidth={640}
    />
  )
}
