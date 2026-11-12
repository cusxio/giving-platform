export type Measure = 'cumulative' | 'weekly'

export interface PaceView {
  readonly measure: Measure
  readonly picked: number
  readonly thisYear: number
}

const THIS_YEAR = 'var(--color-chart-1)'
const PICKED = 'var(--color-chart-2)'
const OTHER_WEEKLY = 'var(--color-fg-subtle)'

const faded = (age: number) =>
  `color-mix(in oklab, var(--color-fg-muted) ${Math.max(20, 85 - (age - 1) * 12)}%, transparent)`

export function yearColor(year: number, view: PaceView): string {
  if (view.measure === 'weekly') {
    return year === view.picked ? THIS_YEAR : OTHER_WEEKLY
  }
  if (year === view.thisYear) {
    return THIS_YEAR
  }
  return year === view.picked ? PICKED : faded(view.thisYear - year)
}

/** Each week shows the picked year and the one before it, or after it for the first year. */
export function shownYears(years: readonly number[], view: PaceView): readonly number[] {
  if (view.measure === 'cumulative') {
    return years
  }
  const at = years.indexOf(view.picked)
  const partner = years[at - 1] ?? years[at + 1]
  return years.filter((year) => year === view.picked || year === partner)
}
