import { TZDate, clientTz, startOfDay } from '#/core/date'

/** Kuala Lumpur calendar days, `YYYY-MM-DD`, both included. */
export interface Range {
  readonly end: string
  readonly start: string
}

/** Instants, from `start` up to but not including `end`. */
export interface Span {
  readonly end: Date
  readonly start: Date
}

export interface Period {
  /** The same days one year earlier. */
  readonly compare: Range
  readonly period: Range
}

const ISO_DATE = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u

function partsOf(iso: string) {
  const parts = ISO_DATE.exec(iso)?.groups
  if (parts === undefined) {
    throw new Error(`not an ISO date: ${iso}`)
  }
  return { day: Number(parts.day), month: Number(parts.month), year: Number(parts.year) }
}

const isoOfUtc = (date: Date) => date.toISOString().slice(0, 10)

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) {
    return false
  }
  const { day, month, year } = partsOf(value)
  return isoOfUtc(new Date(Date.UTC(year, month - 1, day))) === value
}

function shiftDays(iso: string, days: number): string {
  const { day, month, year } = partsOf(iso)
  return isoOfUtc(new Date(Date.UTC(year, month - 1, day + days)))
}

/** 29 February lands on 28 February in a year without one. */
export function shiftYears(iso: string, years: number): string {
  const { day, month, year } = partsOf(iso)
  const lastDay = new Date(Date.UTC(year + years, month, 0)).getUTCDate()
  return isoOfUtc(new Date(Date.UTC(year + years, month - 1, Math.min(day, lastDay))))
}

export const yearOf = (iso: string) => partsOf(iso).year

/** The Kuala Lumpur day an instant falls on. */
export const isoDateOf = (instant: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: clientTz }).format(instant)

/** The instant a Kuala Lumpur day starts. */
const dayStart = (iso: string) => new Date(startOfDay(new TZDate(iso, clientTz)))

export const spanOf = (range: Range): Span => ({
  end: dayStart(shiftDays(range.end, 1)),
  start: dayStart(range.start),
})

/**
 * The period a search asks for: this year so far by default. Its end is never after today, so it
 * always compares like with like.
 */
export function resolvePeriod(
  search: { readonly end?: string; readonly start?: string },
  today: string,
): Period {
  const end = search.end === undefined || search.end > today ? today : search.end
  const asked = search.start ?? `${yearOf(end)}-01-01`
  const start = asked > end ? end : asked
  return {
    compare: { end: shiftYears(end, -1), start: shiftYears(start, -1) },
    period: { end, start },
  }
}

/** Weeks counted from 1 January, so the first days of a year never land in the last year's week. */
export function weekOfYear(iso: string): number {
  const { day, month, year } = partsOf(iso)
  const dayOfYear = (Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86_400_000
  return Math.floor(dayOfYear / 7) + 1
}

/** Every span the page reads, as instants. */
export interface Windows {
  readonly compare: Span
  /** The year up to the period's last day, which a donor must give in to have "given again". */
  readonly last12Months: Span
  /** The year before that, whose donors the gave-again rate follows. */
  readonly months12to24: Span
  /** The year before that, for last year's gave-again rate. */
  readonly months24to36: Span
  readonly period: Span
  /** The year before the period starts, which tells a returning donor from one who came back. */
  readonly yearBeforePeriod: Span
}

/** The year that ends `yearsBack` years before `end`, such as 11 Nov 2024 to 10 Nov 2025. */
export const trailingYear = (end: string, yearsBack: number): Range => ({
  end: shiftYears(end, -yearsBack),
  start: shiftDays(shiftYears(end, -yearsBack - 1), 1),
})

export function windowsOf({ compare, period }: Period): Windows {
  return {
    compare: spanOf(compare),
    last12Months: spanOf(trailingYear(period.end, 0)),
    months12to24: spanOf(trailingYear(period.end, 1)),
    months24to36: spanOf(trailingYear(period.end, 2)),
    period: spanOf(period),
    yearBeforePeriod: spanOf({
      end: shiftDays(period.start, -1),
      start: shiftYears(period.start, -1),
    }),
  }
}
