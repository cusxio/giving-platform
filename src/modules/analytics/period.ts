import { TZDate, clientTz, startOfDay } from '#/core/date'

/** Kuala Lumpur calendar days, `YYYY-MM-DD`, both included. */
export interface Range {
  readonly end: string
  readonly start: string
}

export interface Span {
  readonly end: Date
  readonly start: Date
}

export interface Period {
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

export function shiftYears(iso: string, years: number): string {
  const { day, month, year } = partsOf(iso)
  const lastDay = new Date(Date.UTC(year + years, month, 0)).getUTCDate()
  return isoOfUtc(new Date(Date.UTC(year + years, month - 1, Math.min(day, lastDay))))
}

export const yearOf = (iso: string) => partsOf(iso).year

export const isoDateOf = (instant: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: clientTz }).format(instant)

const dayStart = (iso: string) => new Date(startOfDay(new TZDate(iso, clientTz)))

export const spanOf = (range: Range): Span => ({
  end: dayStart(shiftDays(range.end, 1)),
  start: dayStart(range.start),
})

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

export function weekOfYear(iso: string): number {
  const { day, month, year } = partsOf(iso)
  const dayOfYear = (Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86_400_000
  return Math.floor(dayOfYear / 7) + 1
}

export interface Windows {
  readonly compare: Span
  readonly last12Months: Span
  readonly months12to24: Span
  readonly months24to36: Span
  readonly period: Span
  readonly yearBeforePeriod: Span
}

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
