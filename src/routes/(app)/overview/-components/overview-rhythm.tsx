import { REDACTED_VALUE, monthLabel } from '#/core/formatters'
import type { Overview } from '#/modules/history'
import { cx } from '#/styles/cx'

import { dayMonthYear, listFunds, money } from './format'
import { OverviewCard } from './overview-card'

type Rhythm = NonNullable<Overview['rhythm']>

interface OverviewRhythmProps {
  className?: string
  isCurrentYear: boolean
  privacyMode: boolean
  rhythm: Rhythm
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
            {rhythm.months.map(({ month, total }) => {
              const name = monthLabel(month, 'long')
              let state = 'not yet'
              if (total !== null) {
                state = total > 0 ? money(total, privacyMode) : 'no gift'
              }
              return (
                <li
                  className="flex flex-col items-center gap-y-1"
                  key={month}
                  title={`${name}: ${state}`}
                >
                  <span
                    aria-hidden
                    className={cx(
                      'size-3.5 rounded-full',
                      total === null && 'border border-dashed border-fg-subtle',
                      total === 0 && 'border border-fg-subtle',
                      total !== null && total > 0 && 'bg-fg-1',
                    )}
                  />
                  <span aria-hidden className="text-[10px] text-fg-subtle">
                    {name.charAt(0)}
                  </span>
                  <span className="sr-only">
                    {name}: {state}
                  </span>
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

function Stat(props: { children: React.ReactNode; className?: string; label: string }) {
  return (
    <div className={cx('flex flex-col gap-y-1', props.className)}>
      <dt className="text-xs text-fg-subtle">{props.label}</dt>
      <dd className="text-lg text-fg-1 tabular-nums">{props.children}</dd>
    </div>
  )
}
