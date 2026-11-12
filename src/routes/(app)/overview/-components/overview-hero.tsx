import { ArrowDownIcon, ArrowUpIcon } from '@phosphor-icons/react/dist/ssr'
import { Suspense } from 'react'

import { ChartContainer } from '#/components/ui/chart'
import type { Overview } from '#/modules/history'
import { cx } from '#/styles/cx'

import { money, monthYear } from './format'
import { heroCharts } from './load-hero-charts'

const YearChart = heroCharts.component((m) => m.YearChart)
const YearsChart = heroCharts.component((m) => m.YearsChart)

type Hero = Overview['hero']
type YearHero = Extract<Hero, { kind: 'year' }>

interface OverviewHeroProps {
  className?: string
  hero: Hero
  privacyMode: boolean
}

export function OverviewHero(props: OverviewHeroProps) {
  const { className, hero, privacyMode } = props

  return (
    <ChartContainer className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4">
        <div className="flex flex-col gap-y-1">
          <span className="text-sm text-fg-muted">{heroLabel(hero)}</span>
          <span className="text-3xl font-semibold text-fg-1 tabular-nums">
            {money(hero.total, privacyMode)}
          </span>
          {hero.kind === 'year' && <Comparison hero={hero} privacyMode={privacyMode} />}
        </div>
        {hero.kind === 'year' && hero.lastYear && (
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
        {hero.kind === 'year' ? (
          <YearChart
            lastYear={hero.lastYear}
            privacyMode={privacyMode}
            thisYear={hero.thisYear}
            today={hero.today}
            year={hero.year}
          />
        ) : (
          <YearsChart privacyMode={privacyMode} years={hero.years} />
        )}
      </Suspense>
    </ChartContainer>
  )
}

function heroLabel(hero: Hero) {
  if (hero.kind === 'all') {
    return hero.since ? `Given since ${monthYear.format(hero.since)}` : 'Given so far'
  }
  return hero.today === null ? `Given in ${hero.year}` : `Given in ${hero.year} so far`
}

function Comparison(props: { hero: YearHero; privacyMode: boolean }) {
  const { hero, privacyMode } = props
  const before = hero.lastYearSameDay
  if (before === null || before === 0) {
    return null
  }

  const change = Math.round(((hero.total - before) / before) * 100)
  const against = hero.today === null ? String(hero.year - 1) : 'this time last year'
  const amount = privacyMode ? '' : ` (${money(before, false)})`
  let words = `Level with ${against}${amount}`
  if (change > 0) {
    words = `${change}% ${hero.today === null ? 'more than' : 'ahead of'} ${against}${amount}`
  } else if (change < 0) {
    words = `${-change}% ${hero.today === null ? 'less than' : 'behind'} ${against}${amount}`
  }

  return (
    <span
      className={cx(
        'flex items-center gap-x-1.5 text-sm',
        change > 0 ? 'text-fg-success' : 'text-fg-muted',
      )}
    >
      {change > 0 && <ArrowUpIcon aria-hidden size={12} weight="bold" />}
      {change < 0 && <ArrowDownIcon aria-hidden size={12} weight="bold" />}
      {words}
    </span>
  )
}
