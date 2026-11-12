import { ArrowDownIcon, ArrowUpIcon } from '@phosphor-icons/react/dist/ssr'
import type { ReactNode } from 'react'
import { Suspense, useState } from 'react'

import { ChartContainer } from '#/components/ui/chart'
import type { Overview } from '#/modules/history'
import { cx } from '#/styles/cx'

import { money, monthYear } from './format'
import { heroCharts } from './load-hero-charts'
import { paceStyle } from './pace'

const YearChart = heroCharts.component((m) => m.YearChart)
const PaceChart = heroCharts.component((m) => m.PaceChart)

type Hero = Overview['hero']
type AllHero = Extract<Hero, { kind: 'all' }>

interface OverviewHeroProps {
  className?: string
  hero: Hero
  privacyMode: boolean
}

export function OverviewHero(props: OverviewHeroProps) {
  const { className, hero, privacyMode } = props
  const [picked, setPicked] = useState<number | null>(null)

  if (hero.kind === 'all') {
    const currentYear = hero.years[0].year
    const shown =
      picked !== null && hero.years.some((row) => row.year === picked) ? picked : currentYear
    return (
      <ChartContainer className={className}>
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4">
          <div className="flex flex-col gap-y-1">
            <span className="text-sm text-fg-muted">
              {hero.since ? `Given since ${monthYear.format(hero.since)}` : 'Given so far'}
            </span>
            <span className="text-3xl font-semibold text-fg-1 tabular-nums">
              {money(hero.total, privacyMode)}
            </span>
            <AllYearsComparison hero={hero} privacyMode={privacyMode} />
          </div>
          <ul aria-label="Years" className="flex max-w-sm flex-wrap justify-end gap-1 text-xs">
            {hero.years.map(({ total, year }) => {
              const style = paceStyle(year, currentYear, shown)
              return (
                <li key={year}>
                  <button
                    aria-pressed={year === shown}
                    className={cx(
                      'flex h-7 items-center gap-x-1.5 border px-2 text-fg-muted tabular-nums',
                      year === shown ? 'border-border bg-base-1' : 'border-transparent',
                    )}
                    onClick={() => {
                      setPicked(year)
                    }}
                    type="button"
                  >
                    <span
                      className="w-3.5 border-t-2"
                      style={{
                        borderTopColor: style.color,
                        borderTopStyle: style.dashed ? 'dashed' : 'solid',
                        opacity: style.opacity,
                      }}
                    />
                    {year}
                    <span className="text-fg-subtle">{money(total, privacyMode)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        <Suspense fallback={<div className="h-50" />}>
          <PaceChart
            currentYear={currentYear}
            picked={shown}
            privacyMode={privacyMode}
            today={hero.today}
            years={hero.years}
          />
        </Suspense>
      </ChartContainer>
    )
  }

  return (
    <ChartContainer className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4">
        <div className="flex flex-col gap-y-1">
          <span className="text-sm text-fg-muted">
            {hero.today === null ? `Given in ${hero.year}` : `Given in ${hero.year} so far`}
          </span>
          <span className="text-3xl font-semibold text-fg-1 tabular-nums">
            {money(hero.total, privacyMode)}
          </span>
          <Comparison
            before={hero.lastYearSameDay}
            ongoing={hero.today !== null}
            privacyMode={privacyMode}
            total={hero.total}
            year={hero.year}
          />
        </div>
        {hero.lastYear && (
          <div className="flex gap-x-4 text-xs text-fg-muted">
            <span className="flex items-center gap-x-1.5">
              <span className="h-0.5 w-3.5 bg-chart-1" />
              {hero.year}
            </span>
            <span className="flex items-center gap-x-1.5">
              <span className="w-3.5 border-t-2 border-dashed border-fg-subtle" />
              {hero.year - 1}
            </span>
          </div>
        )}
      </div>

      <Suspense fallback={<div className="h-50" />}>
        <YearChart
          lastYear={hero.lastYear}
          privacyMode={privacyMode}
          thisYear={hero.thisYear}
          today={hero.today}
          year={hero.year}
        />
      </Suspense>
    </ChartContainer>
  )
}

/** Once this year's gifts pass all of last year's, says so; until then, compares the same date. */
function AllYearsComparison(props: { hero: AllHero; privacyMode: boolean }) {
  const { hero, privacyMode } = props
  const [current, last] = hero.years
  if (last !== undefined && last.total > 0 && current.total > last.total) {
    return <Trend change={1}>{`${current.year} has already passed all of ${last.year}`}</Trend>
  }
  return (
    <Comparison
      before={hero.lastYearSameDay}
      ongoing
      privacyMode={privacyMode}
      subject={String(current.year)}
      total={current.total}
      year={current.year}
    />
  )
}

interface ComparisonProps {
  before: number | null
  /** The year is not over, so it compares with last year by the same date. */
  ongoing: boolean
  privacyMode: boolean
  /** Names what is compared, when the hero total is something else. */
  subject?: string
  total: number
  year: number
}

function Comparison(props: ComparisonProps) {
  const { before, ongoing, privacyMode, subject, total, year } = props
  if (before === null || before === 0) {
    return null
  }

  const change = Math.round(((total - before) / before) * 100)
  const against = ongoing ? 'this time last year' : String(year - 1)
  const amount = privacyMode ? '' : ` (${money(before, false)})`
  let words = `level with ${against}${amount}`
  if (change > 0) {
    words = `${change}% ${ongoing ? 'ahead of' : 'more than'} ${against}${amount}`
  } else if (change < 0) {
    words = `${-change}% ${ongoing ? 'behind' : 'less than'} ${against}${amount}`
  }

  return (
    <Trend change={change}>
      {subject === undefined
        ? words.charAt(0).toUpperCase() + words.slice(1)
        : `${subject} is ${words}`}
    </Trend>
  )
}

function Trend(props: { change: number; children: ReactNode }) {
  const { change, children } = props
  return (
    <span
      className={cx(
        'flex items-center gap-x-1.5 text-sm',
        change > 0 ? 'text-fg-success' : 'text-fg-muted',
      )}
    >
      {change > 0 && <ArrowUpIcon aria-hidden size={12} weight="bold" />}
      {change < 0 && <ArrowDownIcon aria-hidden size={12} weight="bold" />}
      {children}
    </span>
  )
}
