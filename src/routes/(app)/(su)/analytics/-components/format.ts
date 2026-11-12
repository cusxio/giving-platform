import { FUND_CHART_COLOR_MAP } from '#/core/brand/funds'
import { TZDate, clientTz } from '#/core/date'
import { createCurrencyFormatter, createDateFormatter } from '#/core/formatters'
import type { Change, Range, Rate } from '#/modules/analytics'

const MIN_FOR_PERCENT = 10

export const NO_VALUE = '—'

export const currency = createCurrencyFormatter({ showSymbol: true })
export const wholeCurrency = createCurrencyFormatter({ maximumFractionDigits: 0, showSymbol: true })
export const compactCurrency = createCurrencyFormatter({ notation: 'compact', showSymbol: true })
export const count = new Intl.NumberFormat('en-MY')

export const percent = (share: number) => `${Math.round(share * 100)}%`

export function shareText(part: number, whole: number) {
  return whole >= MIN_FOR_PERCENT ? percent(part / whole) : null
}

export interface RateText {
  readonly main: string
  readonly detail: string
  readonly share: number
}

export function rateText(rate: Rate | null): RateText {
  if (rate === null) {
    return { detail: 'Needs two years of history', main: NO_VALUE, share: 0 }
  }
  const share = rate.of > 0 ? rate.gaveAgain / rate.of : 0
  const counts = `${count.format(rate.gaveAgain)} of ${count.format(rate.of)}`
  return rate.of >= MIN_FOR_PERCENT
    ? { detail: counts, main: percent(share), share }
    : { detail: '', main: counts, share }
}

export type Tone = 'down' | 'flat' | 'up'

export function changeText(value: number, prior: number): { text: string; tone: Tone } {
  if (prior === 0) {
    return value === 0
      ? { text: 'None either year', tone: 'flat' }
      : { text: 'None last year', tone: 'up' }
  }
  const change = (value - prior) / prior
  if (Math.abs(change) < 0.0005) {
    return { text: 'Same as last year', tone: 'flat' }
  }
  const arrow = change > 0 ? '▲' : '▼'
  return {
    text: `${arrow} ${Math.abs(change * 100).toFixed(1)}%`,
    tone: change > 0 ? 'up' : 'down',
  }
}

const FIRST_YEARS: Record<Exclude<Change['kind'], 'against'>, string> = {
  'first-full-year': 'First full year',
  'first-year': 'First year',
}

export function yearChangeText(value: number, change: Change): { text: string; tone: Tone } {
  return change.kind === 'against'
    ? changeText(value, change.prior)
    : { text: FIRST_YEARS[change.kind], tone: 'flat' }
}

export function growthText(rate: number) {
  const points = Math.round(rate * 100)
  if (points === 0) {
    return '0%'
  }
  return `${points > 0 ? '+' : '−'}${Math.abs(points)}%`
}

export function rateChangeText(
  value: Rate | null,
  prior: Rate | null,
): { text: string; tone: Tone } {
  if (
    value === null ||
    prior === null ||
    value.of < MIN_FOR_PERCENT ||
    prior.of < MIN_FOR_PERCENT
  ) {
    return { text: NO_VALUE, tone: 'flat' }
  }
  const points = Math.round((value.gaveAgain / value.of - prior.gaveAgain / prior.of) * 100)
  if (points === 0) {
    return { text: 'Same as last year', tone: 'flat' }
  }
  return {
    text: `${points > 0 ? '▲' : '▼'} ${Math.abs(points)} pts`,
    tone: points > 0 ? 'up' : 'down',
  }
}

export const TONE_CLASS: Record<Tone, string> = {
  down: 'text-red-fg',
  flat: 'text-fg-subtle',
  up: 'text-fg-success',
}

const dayMonth = createDateFormatter({ day: 'numeric', month: 'short' })
const dayMonthYear = createDateFormatter({ day: 'numeric', month: 'short', year: 'numeric' })

const dateOf = (iso: string) =>
  new TZDate(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
    clientTz,
  )

export function rangeText(range: Range) {
  const start = dateOf(range.start)
  const end = dateOf(range.end)
  const startText =
    range.start.slice(0, 4) === range.end.slice(0, 4)
      ? dayMonth.format(start)
      : dayMonthYear.format(start)
  return `${startText} to ${dayMonthYear.format(end)}`
}

export const weekStartText = (year: number, week: number) =>
  dayMonth.format(new TZDate(year, 0, 1 + (week - 1) * 7, clientTz))

const monthShort = createDateFormatter({ month: 'short' })
const monthYear = createDateFormatter({ month: 'short', year: '2-digit' })

export const monthText = (month: string, withYear: boolean) =>
  (withYear ? monthYear : monthShort).format(dateOf(`${month}-15`))

export function monthsOf(range: Range): string[] {
  const months: string[] = []
  let year = Number(range.start.slice(0, 4))
  let month = Number(range.start.slice(5, 7))
  const last = range.end.slice(0, 7)
  for (;;) {
    const key = `${year}-${String(month).padStart(2, '0')}`
    months.push(key)
    if (key >= last) {
      return months
    }
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const BLOCKS = ['12am', '3am', '6am', '9am', '12pm', '3pm', '6pm', '9pm']

const hasColor = (key: string): key is keyof typeof FUND_CHART_COLOR_MAP =>
  Object.hasOwn(FUND_CHART_COLOR_MAP, key)

export function fundColor(fundName: string): string {
  const key = fundName.toLowerCase()
  const token = hasColor(key) ? FUND_CHART_COLOR_MAP[key] : 'text-chart-2'
  return `var(--color-${token.slice('text-'.length)})`
}
