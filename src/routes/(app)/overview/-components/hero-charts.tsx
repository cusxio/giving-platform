import { areaY, defineChart, dot, lineY, ruleX } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { useMemo } from 'react'

import { TZDate, clientTz, differenceInDays } from '#/core/date'
import { createCurrencyFormatter, monthLabel } from '#/core/formatters'

import { dayMonth, money } from './format'
import { LAST_YEAR, THIS_YEAR, paceStyle } from './pace'

const compact = createCurrencyFormatter({ notation: 'compact' })

interface DayTotal {
  day: number
  total: number
  year: number
}

const toRows = (totals: readonly number[], year: number): DayTotal[] =>
  totals.map((total, day) => ({ day, total, year }))

/** An x scale of the days of `year`, ticked at each month's start. */
function daysOf(year: number) {
  const jan1 = new TZDate(year, 0, 1, clientTz)
  const days = differenceInDays(new TZDate(year + 1, 0, 1, clientTz), jan1)
  const monthStarts = Array.from({ length: 12 }, (_, month) =>
    differenceInDays(new TZDate(year, month, 1, clientTz), jan1),
  )
  const monthOf = new Map(monthStarts.map((day, month) => [day, month + 1]))
  return {
    axis: {
      ticks: {
        format: (day: number) => monthLabel(monthOf.get(day) ?? 1, 'short'),
        values: monthStarts,
      },
    },
    scale: scaleLinear().domain([0, days - 1]),
  }
}

const amounts = (privacyMode: boolean) => ({
  axis: { ticks: { count: 3, format: (amount: number) => compact.format(amount, privacyMode) } },
  grid: true,
  nice: true,
  scale: scaleLinear,
})

const dayTitle = (year: number, day: number) =>
  dayMonth.format(new TZDate(year, 0, 1 + day, clientTz))

interface YearChartProps {
  lastYear: readonly number[] | null
  privacyMode: boolean
  thisYear: readonly number[]
  today: number | null
  year: number
}

export function YearChart(props: YearChartProps) {
  const { lastYear, privacyMode, thisYear, today, year } = props

  const definition = useMemo(() => {
    const current = toRows(thisYear, year)
    const previous = lastYear ? toRows(lastYear, year - 1) : []
    const latest = current.at(-1)

    return defineChart({
      focus: 'group-x',
      marks: [
        areaY(current, {
          fill: THIS_YEAR,
          fillOpacity: 0.08,
          x: 'day',
          y1: 0,
          y2: 'total',
          z: 'year',
        }),
        lineY(previous, {
          stroke: LAST_YEAR,
          strokeDasharray: '5 5',
          strokeWidth: 1.5,
          x: 'day',
          y: 'total',
          z: 'year',
        }),
        lineY(current, { stroke: THIS_YEAR, strokeWidth: 2.5, x: 'day', y: 'total', z: 'year' }),
        ruleX(today === null ? [] : [today], { stroke: LAST_YEAR, strokeDasharray: '2 3' }),
        dot(today === null || latest === undefined ? [] : [latest], {
          fill: THIS_YEAR,
          r: 4,
          x: 'day',
          y: 'total',
          z: 'year',
        }),
      ],
      scales: { x: daysOf(year), y: amounts(privacyMode) },
      tooltip: {
        content: (points) => ({
          rows: points.map((point) => ({
            color: point.datum.year === year ? THIS_YEAR : LAST_YEAR,
            label: String(point.datum.year),
            value: money(point.datum.total, privacyMode),
          })),
          title: dayTitle(year, points[0]?.datum.day ?? 0),
        }),
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

interface PaceChartProps {
  currentYear: number
  picked: number
  privacyMode: boolean
  today: number
  /** Newest first, each on the current year's calendar. */
  years: readonly { runningTotals: readonly number[]; year: number }[]
}

export function PaceChart(props: PaceChartProps) {
  const { currentYear, picked, privacyMode, today, years } = props

  const definition = useMemo(() => {
    // oxlint-disable-next-line unicorn/no-array-reverse -- Avoid toReversed until the runtime lib supports it.
    const oldestFirst = years.filter((row) => row.year !== picked).reverse()
    const pickedLast = [...oldestFirst, ...years.filter((row) => row.year === picked)]
    const todayTotal = years.find((row) => row.year === currentYear)?.runningTotals[today]

    return defineChart({
      focus: 'group-x',
      marks: [
        ...pickedLast.map(({ runningTotals, year }) => {
          const style = paceStyle(year, currentYear, picked)
          return lineY(toRows(runningTotals, year), {
            stroke: style.color,
            strokeOpacity: style.opacity,
            strokeWidth: style.width,
            ...(style.dashed ? { strokeDasharray: '5 5' } : {}),
            x: 'day',
            y: 'total',
            z: 'year',
          })
        }),
        ruleX([today], { stroke: LAST_YEAR, strokeDasharray: '2 3' }),
        dot(
          todayTotal === undefined ? [] : [{ day: today, total: todayTotal, year: currentYear }],
          { fill: THIS_YEAR, r: 4, x: 'day', y: 'total', z: 'year' },
        ),
      ],
      scales: { x: daysOf(currentYear), y: amounts(privacyMode) },
      tooltip: {
        content: (points) => ({
          rows: years.flatMap(({ year }) => {
            const point = points.find((candidate) => candidate.datum.year === year)
            return point
              ? [
                  {
                    color: paceStyle(year, currentYear, picked).color,
                    label: String(year),
                    value: money(point.datum.total, privacyMode),
                  },
                ]
              : []
          }),
          title: dayTitle(currentYear, points[0]?.datum.day ?? 0),
        }),
        use: tooltip,
      },
    })
  }, [currentYear, picked, privacyMode, today, years])

  return (
    <Chart
      ariaLabel={`Running total within each year, ${years.at(-1)?.year ?? currentYear} to ${currentYear}`}
      className="px-4 pt-2 pb-2"
      definition={definition}
      height={200}
      initialWidth={640}
    />
  )
}
