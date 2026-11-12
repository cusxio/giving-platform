import { FUND_CHART_COLOR_MAP } from '#/core/brand/funds'
import { createCurrencyFormatter, createDateFormatter } from '#/core/formatters'
import type { Range, Rate } from '#/modules/analytics'

/** Below this many donors a share reads as a count, so 2 of 3 never reads as 67%. */
const MIN_FOR_PERCENT = 10

const NO_VALUE = '—'

export const currency = createCurrencyFormatter({ showSymbol: true })
export const compactCurrency = createCurrencyFormatter({ notation: 'compact', showSymbol: true })
export const count = new Intl.NumberFormat('en-MY')

export const percent = (share: number) => `${Math.round(share * 100)}%`

/** A share of donors, or the plain count when there are too few for a percentage to mean much. */
export function shareText(part: number, whole: number) {
  return whole >= MIN_FOR_PERCENT ? percent(part / whole) : null
}

export interface RateText {
  /** The headline: a percentage, a count such as "2 of 3", or a dash. */
  readonly main: string
  /** The counts behind a percentage, or why there is no rate. */
  readonly detail: string
  /** From 0 to 1, for a meter. */
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

/** How a figure moved against last year, such as "▲ 8.2%". */
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

/** How a rate moved against last year, in percentage points. */
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

/** Noon UTC is the same calendar day in Kuala Lumpur. */
const dateOf = (iso: string) => new Date(`${iso}T12:00:00Z`)

/** Such as "1 Jan to 10 Nov 2026", or "1 Dec 2025 to 31 Jan 2026" across a year. */
export function rangeText(range: Range) {
  const start = dateOf(range.start)
  const end = dateOf(range.end)
  const startText =
    range.start.slice(0, 4) === range.end.slice(0, 4)
      ? dayMonth.format(start)
      : dayMonthYear.format(start)
  return `${startText} to ${dayMonthYear.format(end)}`
}

const monthShort = createDateFormatter({ month: 'short' })
const monthYear = createDateFormatter({ month: 'short', year: '2-digit' })

/** A `YYYY-MM` month, with its year only when the period spans more than one. */
export const monthText = (month: string, withYear: boolean) =>
  (withYear ? monthYear : monthShort).format(dateOf(`${month}-15`))

/** Every `YYYY-MM` from the period's first month to its last. */
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

/** Weekday 1 to 7, Monday first, as the server counts them. */
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
/** Three-hour blocks 0 to 7, by the hour each starts. */
export const BLOCKS = ['12am', '3am', '6am', '9am', '12pm', '3pm', '6pm', '9pm']

const hasColor = (key: string): key is keyof typeof FUND_CHART_COLOR_MAP =>
  Object.hasOwn(FUND_CHART_COLOR_MAP, key)

/** The brand's chart colour for a fund, matched by name, as a CSS colour. */
export function fundColor(fundName: string): string {
  const key = fundName.toLowerCase()
  const token = hasColor(key) ? FUND_CHART_COLOR_MAP[key] : 'text-chart-2'
  return `var(--color-${token.slice('text-'.length)})`
}
