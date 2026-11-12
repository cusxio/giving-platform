import type { ReactNode } from 'react'

import { REDACTED_VALUE, monthLabel } from '#/core/formatters'
import type { Overview } from '#/modules/history'
import { cx } from '#/styles/cx'

import { dayMonthYear, listFunds, longMonthYear, money } from './format'
import { OverviewCard } from './overview-card'

type Rhythm = Overview['rhythm']
type YearRhythm = Extract<Rhythm, { kind: 'year' }>
type AllRhythm = Extract<Rhythm, { kind: 'all' }>
type MonthState = YearRhythm['months'][number]['state']

const DOT: Record<MonthState, string> = {
  before: '',
  given: 'bg-fg-1',
  noGift: 'border border-fg-subtle',
  notYet: 'border border-dashed border-fg-subtle',
}

const STATE_WORDS = { before: 'before your first gift', noGift: 'no gift', notYet: 'not yet' }

const KEY = [
  ['given', 'Gave'],
  ['noGift', 'No gift'],
  ['notYet', 'Not yet'],
] as const

const monthWords = (month: YearRhythm['months'][number], privacyMode: boolean) =>
  month.state === 'given' ? money(month.total, privacyMode) : STATE_WORDS[month.state]

const initial = (month: number) => monthLabel(month, 'long').charAt(0)

function MonthDot(props: { state: MonthState }) {
  return (
    <span
      aria-hidden
      className={cx('flex size-3.5 items-center justify-center rounded-full', DOT[props.state])}
    >
      {props.state === 'before' && <span className="size-1 rounded-full bg-border" />}
    </span>
  )
}

interface OverviewRhythmProps {
  className?: string
  isCurrentYear: boolean
  privacyMode: boolean
  rhythm: YearRhythm
  year: number
}

export function OverviewRhythm(props: OverviewRhythmProps) {
  const { className, isCurrentYear, privacyMode, rhythm, year } = props
  const when = isCurrentYear ? 'this year' : `in ${year}`
  const headline =
    rhythm.monthsGiven === rhythm.monthsSoFar
      ? `You gave every month ${when}`
      : `You gave in ${rhythm.monthsGiven} of ${rhythm.monthsSoFar} months ${when}`

  return (
    <OverviewCard className={className} title="Your rhythm">
      <div className="flex flex-col gap-y-5 p-4">
        <div className="flex flex-col gap-y-3">
          <span className="text-fg-1">{headline}</span>
          <ol className="grid grid-cols-12 gap-1.5">
            {rhythm.months.map((month) => {
              const label = `${monthLabel(month.month, 'long')}: ${monthWords(month, privacyMode)}`
              return (
                <li className="flex flex-col items-center gap-y-1" key={month.month} title={label}>
                  <MonthDot state={month.state} />
                  <span aria-hidden className="text-[10px] text-fg-subtle">
                    {initial(month.month)}
                  </span>
                  <span className="sr-only">{label}</span>
                </li>
              )
            })}
          </ol>
        </div>

        <dl className="grid grid-cols-2 gap-4">
          <Stat label="Gifts">{privacyMode ? REDACTED_VALUE : rhythm.gifts}</Stat>
          <Stat label="Usual gift">{money(rhythm.usualGift, privacyMode)}</Stat>
          {rhythm.largest && (
            <Stat className="col-span-2" label="Largest gift">
              {money(rhythm.largest.amount, privacyMode)}{' '}
              <span className="text-sm text-fg-subtle">
                on {dayMonthYear.format(rhythm.largest.date)}, {listFunds(rhythm.largest.funds)}
              </span>
            </Stat>
          )}
        </dl>
      </div>
    </OverviewCard>
  )
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const YEAR_ROW = 'grid grid-cols-[2.5rem_repeat(12,minmax(0,1fr))] items-center gap-x-1.5'

interface AllYearsRhythmProps {
  className?: string
  privacyMode: boolean
  rhythm: AllRhythm
}

export function AllYearsRhythm(props: AllYearsRhythmProps) {
  const { className, privacyMode, rhythm } = props
  const since = rhythm.firstGift ? ` since ${longMonthYear.format(rhythm.firstGift)}` : ''
  const headline =
    rhythm.monthsGiven === rhythm.monthsSoFar
      ? `You gave every month${since}`
      : `You gave in ${rhythm.monthsGiven} of ${rhythm.monthsSoFar} months${since}`

  return (
    <OverviewCard className={className} title="Your rhythm">
      <div className="flex flex-col gap-y-5 p-4">
        <div className="flex flex-col gap-y-3">
          <span className="text-fg-1">{headline}</span>
          <div className="flex flex-col gap-y-2.5">
            <div aria-hidden className={cx(YEAR_ROW, 'text-center text-[10px] text-fg-subtle')}>
              <span />
              {MONTHS.map((month) => (
                <span key={month}>{initial(month)}</span>
              ))}
            </div>
            <ol className="flex flex-col gap-y-2.5">
              {rhythm.years.map(({ months, year }) => (
                <li className={YEAR_ROW} key={year}>
                  <span aria-hidden className="text-xs text-fg-muted tabular-nums">
                    {year}
                  </span>
                  {months.map((month) => {
                    const label = `${monthLabel(month.month, 'long')} ${year}: ${monthWords(month, privacyMode)}`
                    return (
                      <span className="flex justify-center" key={month.month} title={label}>
                        <MonthDot state={month.state} />
                        <span className="sr-only">{label}</span>
                      </span>
                    )
                  })}
                </li>
              ))}
            </ol>
          </div>
          <ul aria-hidden className="flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-fg-subtle">
            {KEY.map(([state, words]) => (
              <li className="flex items-center gap-x-1.5" key={state}>
                <MonthDot state={state} />
                {words}
              </li>
            ))}
          </ul>
        </div>

        <dl className="grid grid-cols-2 gap-4">
          <Stat label="Gifts">{privacyMode ? REDACTED_VALUE : rhythm.gifts}</Stat>
          <Stat label="Usual gift">{money(rhythm.usualGift, privacyMode)}</Stat>
          {rhythm.firstGift && (
            <Stat label="First gift">{dayMonthYear.format(rhythm.firstGift)}</Stat>
          )}
          {rhythm.largest && (
            <Stat label="Largest gift">
              {money(rhythm.largest.amount, privacyMode)}
              <span className="block text-sm text-fg-subtle">
                {dayMonthYear.format(rhythm.largest.date)}, {listFunds(rhythm.largest.funds)}
              </span>
            </Stat>
          )}
        </dl>
      </div>
    </OverviewCard>
  )
}

function Stat(props: { children: ReactNode; className?: string; label: string }) {
  return (
    <div className={cx('flex flex-col gap-y-1', props.className)}>
      <dt className="text-xs text-fg-subtle">{props.label}</dt>
      <dd className="text-lg text-fg-1 tabular-nums">{props.children}</dd>
    </div>
  )
}
