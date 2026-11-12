import type { EveryYear } from '#/modules/analytics'
import { cx } from '#/styles/cx'

import type { Tone } from './format'
import { NO_VALUE, TONE_CLASS, count, growthText, wholeCurrency, yearChangeText } from './format'

interface Kpi {
  label: string
  note: { text: string; tone: Tone }
  value: string
}

const flat = (text: string) => ({ text, tone: 'flat' as const })

function thisYearNote(everyYear: EveryYear) {
  const { change, received } = everyYear.kpis.thisYear
  const note = yearChangeText(received, change)
  return change.kind === 'against' && change.prior > 0
    ? { ...note, text: `${note.text} vs same days of ${everyYear.year - 1}` }
    : note
}

export function EveryYearKpis(props: { everyYear: EveryYear }) {
  const { everyYear } = props
  const { bestFullYear, growth, received, thisYear } = everyYear.kpis
  const kpis: Kpi[] = [
    {
      label: `Received since ${everyYear.firstYear}`,
      note: flat(`${count.format(received.gifts)} gifts`),
      value: wholeCurrency.format(received.received),
    },
    {
      label: `${everyYear.year} so far`,
      note: thisYearNote(everyYear),
      value: wholeCurrency.format(thisYear.received),
    },
    {
      label: 'Best full year',
      note: flat(bestFullYear === null ? 'Needs a full year' : String(bestFullYear.year)),
      value: bestFullYear === null ? NO_VALUE : wholeCurrency.format(bestFullYear.received),
    },
    {
      label: 'Growth per year',
      note: flat(
        growth === null ? 'Needs two full years' : `On average, ${growth.from} to ${growth.to}`,
      ),
      value: growth === null ? NO_VALUE : growthText(growth.rate),
    },
  ]

  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <div
          className="flex flex-col gap-y-2 border border-border bg-base-0/50 p-4"
          key={kpi.label}
        >
          <dt className="text-xs text-fg-subtle">{kpi.label}</dt>
          <dd className="text-2xl text-fg-1 tabular-nums">{kpi.value}</dd>
          <dd className={cx('text-xs tabular-nums', TONE_CLASS[kpi.note.tone])}>{kpi.note.text}</dd>
        </div>
      ))}
    </dl>
  )
}
