import { useMemo, useState } from 'react'

import type { EveryYear } from '#/modules/analytics'
import { cx } from '#/styles/cx'

import { ChartSlot } from './chart-slot'
import { compactCurrency } from './format'
import { charts } from './load-charts'
import { runningTakeaway, weeklyTakeaway } from './pace-summary'
import type { Measure, PaceView } from './pace-view'
import { shownYears, yearColor } from './pace-view'
import { Note, Panel, Takeaway } from './panel'

const PaceChart = charts.component((m) => m.PaceChart)

const MEASURES: readonly { label: string; value: Measure }[] = [
  { label: 'Running total', value: 'cumulative' },
  { label: 'Each week', value: 'weekly' },
]

export function PacePanel(props: { everyYear: EveryYear }) {
  const { everyYear } = props
  const years = useMemo(
    // oxlint-disable-next-line unicorn/no-array-sort -- Avoid toSorted until the runtime lib supports it.
    () => everyYear.years.map((row) => row.year).sort((a, b) => a - b),
    [everyYear.years],
  )
  const [measure, setMeasure] = useState<Measure>('cumulative')
  const [picked, setPicked] = useState(() =>
    years.includes(everyYear.year) ? everyYear.year : (years.at(-1) ?? everyYear.year),
  )
  const view: PaceView = useMemo(
    () => ({ measure, picked, thisYear: everyYear.year }),
    [everyYear.year, measure, picked],
  )
  const shown = useMemo(() => shownYears(years, view), [view, years])

  return (
    <Panel
      aside={
        <fieldset className="flex border border-border bg-base-0 p-0.5">
          <legend className="sr-only">Measure</legend>
          {MEASURES.map((option) => (
            <button
              aria-pressed={measure === option.value}
              className={cx(
                'h-7 px-3 text-sm transition-colors',
                measure === option.value
                  ? 'bg-elevated text-fg-default'
                  : 'text-fg-muted hover:text-fg-default',
              )}
              key={option.value}
              onClick={() => {
                setMeasure(option.value)
              }}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </fieldset>
      }
      title="Pace, every year"
    >
      <Takeaway>
        {measure === 'cumulative'
          ? runningTakeaway(everyYear.pace, everyYear.year)
          : weeklyTakeaway(everyYear.pace.points, shown, picked)}
      </Takeaway>
      <ChartSlot>
        <PaceChart
          lastWeek={everyYear.pace.lastWeek}
          points={everyYear.pace.points}
          shown={shown}
          view={view}
        />
      </ChartSlot>
      <fieldset className="flex flex-wrap gap-1.5 px-4 pt-1 pb-2 text-xs">
        <legend className="sr-only">Pick a year</legend>
        {everyYear.years.map((row) => (
          <button
            aria-pressed={row.year === picked}
            className={cx(
              'flex h-8 items-center gap-x-1.5 border px-2.5 transition-colors',
              row.year === picked
                ? 'border-border bg-elevated'
                : 'border-transparent hover:border-border',
              shown.includes(row.year) ? 'text-fg-default' : 'text-fg-subtle',
            )}
            key={row.year}
            onClick={() => {
              setPicked(row.year)
            }}
            type="button"
          >
            <span
              aria-hidden
              className="h-0.5 w-3.5"
              style={{
                backgroundColor: shown.includes(row.year)
                  ? yearColor(row.year, view)
                  : 'var(--color-border)',
              }}
            />
            {row.year}
            <span className="text-fg-subtle">{compactCurrency.format(row.received)}</span>
          </button>
        ))}
      </fieldset>
      <Note className="px-4 pb-3">
        {measure === 'cumulative'
          ? 'Each line restarts on 1 January. Dashed line: today. Pick a year to bring it forward.'
          : 'Each week shows the picked year and the year before, since every year at once would tangle. Pick a year to change which two.'}
      </Note>
    </Panel>
  )
}
