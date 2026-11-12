import { funds } from '#/core/brand'
import type { Fund } from '#/core/brand/funds'
import {
  TZDate,
  addDays,
  addYears,
  clientTz,
  differenceInDays,
  serverTz,
  startOfDay,
  startOfYear,
} from '#/core/date'
import { centsToRinggit } from '#/core/money'
import type { TransactionStatus } from '#/core/transaction-status'

/** A Kuala Lumpur calendar year, or every year. */
export type OverviewYear = 'all' | number

const FAILED_GIFT_NOTICE_DAYS = 7

interface GiftItemRow {
  readonly amount: number
  readonly createdAt: Date
  readonly fundName: string
  readonly giftAmount: number
  readonly transactionId: string
}

interface NewestItemRow {
  readonly amount: number
  readonly createdAt: Date
  readonly fundName: string
  readonly giftAmount: number
  readonly status: TransactionStatus
}

interface RecentRow {
  readonly amount: number
  readonly createdAt: Date
  readonly funds: readonly string[]
  readonly id: string
  readonly status: TransactionStatus
}

interface CardRow {
  /** `YYYYMM`. */
  readonly cardExp: string
  readonly cardNoMask: string
  readonly cardType: string
}

interface Gift {
  readonly amount: number
  readonly createdAt: Date
  readonly items: readonly { readonly amount: number; readonly fundName: string }[]
}

type GiveSearch = Partial<Record<Fund, number>>

export function getYearDateRange(year: OverviewYear) {
  if (year === 'all') {
    return { endDateUTCExclusive: undefined, startDateUTC: undefined }
  }

  const referenceDate = new TZDate(year, 0, 1, clientTz)
  const startDate = startOfYear(referenceDate)
  const endDate = startOfYear(addYears<TZDate>(startDate, 1))

  return {
    endDateUTCExclusive: new Date(endDate.withTimeZone(serverTz)),
    startDateUTC: new Date(startDate.withTimeZone(serverTz)),
  }
}

export function scopeFor<Donor>(donor: Donor, year: OverviewYear) {
  const { startDateUTC, endDateUTCExclusive } = getYearDateRange(year)
  return { donor, endExclusive: endDateUTCExclusive, start: startDateUTC }
}

export function giftScopeFor<Donor>(donor: Donor, year: OverviewYear) {
  const scope = scopeFor(donor, year)
  return year === 'all' ? scope : { ...scope, start: getYearDateRange(year - 1).startDateUTC }
}

/** The fund a name refers to, if it is one the give page takes. */
export function fundOf(fundName: string): Fund | undefined {
  return funds.find((fund) => fund === fundName.toLowerCase())
}

const klYear = (date: Date) => new TZDate(date, clientTz).getFullYear()

const daysIn = (year: number) =>
  differenceInDays(new TZDate(year + 1, 0, 1, clientTz), new TZDate(year, 0, 1, clientTz))

/**
 * The 0-based day of `year` that has the same Kuala Lumpur calendar date as `date`. A 29 February
 * moved into a year without one lands on 28 February.
 */
function dayIndex(date: Date, year: number) {
  const local = new TZDate(date, clientTz)
  const moved = addYears<TZDate>(local, year - local.getFullYear())
  return differenceInDays(startOfDay(moved), startOfYear(moved))
}

function runningTotals(gifts: readonly Gift[], year: number, length: number) {
  const perDay = Array.from({ length }, () => 0)
  for (const gift of gifts) {
    const day = dayIndex(gift.createdAt, year)
    if (day < length) {
      perDay[day] = (perDay[day] ?? 0) + gift.amount
    }
  }
  let total = 0
  return perDay.map((cents) => centsToRinggit((total += cents)))
}

function groupGifts(rows: readonly GiftItemRow[]): Gift[] {
  const byId = new Map<string, Gift>()
  for (const row of rows) {
    const gift = byId.get(row.transactionId)
    const item = { amount: row.amount, fundName: row.fundName }
    byId.set(
      row.transactionId,
      gift
        ? { ...gift, items: [...gift.items, item] }
        : { amount: row.giftAmount, createdAt: row.createdAt, items: [item] },
    )
  }
  return [...byId.values()]
}

export function median(amounts: readonly number[]) {
  // oxlint-disable-next-line unicorn/no-array-sort -- Avoid toSorted until the runtime lib supports it.
  const sorted = [...amounts].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length === 0) {
    return 0
  }
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2)
}

function yearHero(gifts: readonly Gift[], year: number, now: TZDate) {
  const thisYearGifts = gifts.filter((gift) => klYear(gift.createdAt) === year)
  const lastYearGifts = gifts.filter((gift) => klYear(gift.createdAt) === year - 1)
  const today = now.getFullYear() === year ? dayIndex(now, year) : null
  const thisYear = runningTotals(thisYearGifts, year, today === null ? daysIn(year) : today + 1)
  const lastYear =
    lastYearGifts.length === 0 ? null : runningTotals(lastYearGifts, year, daysIn(year))

  return {
    kind: 'year' as const,
    lastYear,
    lastYearSameDay: lastYear?.[thisYear.length - 1] ?? null,
    thisYear,
    today,
    total: thisYear.at(-1) ?? 0,
    year,
  }
}

function earliestGift(gifts: readonly Gift[]) {
  let earliest: Gift | undefined
  for (const gift of gifts) {
    if (earliest === undefined || gift.createdAt < earliest.createdAt) {
      earliest = gift
    }
  }
  return earliest
}

function allHero(gifts: readonly Gift[], now: TZDate) {
  const currentYear = now.getFullYear()
  const today = dayIndex(now, currentYear)
  const since = earliestGift(gifts)?.createdAt ?? null
  const firstYear = since ? klYear(since) : currentYear
  const yearRow = (year: number) => {
    const totals = runningTotals(
      gifts.filter((gift) => klYear(gift.createdAt) === year),
      currentYear,
      year === currentYear ? today + 1 : daysIn(currentYear),
    )
    return { runningTotals: totals, total: totals.at(-1) ?? 0, year }
  }
  const years: [ReturnType<typeof yearRow>, ...ReturnType<typeof yearRow>[]] = [
    yearRow(currentYear),
    ...Array.from({ length: currentYear - firstYear }, (_, i) => yearRow(currentYear - 1 - i)),
  ]

  return {
    kind: 'all' as const,
    lastYearSameDay: years[1]?.runningTotals[today] ?? null,
    since,
    today,
    total: centsToRinggit(gifts.reduce((sum, gift) => sum + gift.amount, 0)),
    years,
  }
}

function fundShares(gifts: readonly Gift[]) {
  const byFund = new Map<string, number>()
  for (const { items } of gifts) {
    for (const item of items) {
      byFund.set(item.fundName, (byFund.get(item.fundName) ?? 0) + item.amount)
    }
  }
  const total = [...byFund.values()].reduce((sum, amount) => sum + amount, 0)
  return (
    [...byFund]
      // oxlint-disable-next-line unicorn/no-array-sort -- Avoid toSorted until the runtime lib supports it.
      .sort(([nameA, a], [nameB, b]) => b - a || nameA.localeCompare(nameB))
      .map(([fundName, amount]) => ({
        amount: centsToRinggit(amount),
        fundName,
        share: amount / total,
      }))
  )
}

/** Months since year 0, so consecutive calendar months differ by one. */
const monthNumber = (date: Date) => {
  const local = new TZDate(date, clientTz)
  return local.getFullYear() * 12 + local.getMonth()
}

type RhythmMonth =
  | { month: number; state: 'before' | 'noGift' | 'notYet' }
  | { month: number; state: 'given'; total: number }

/** The twelve months of `year`. `from` and `to` are the month numbers of the first and last that count. */
function rhythmMonths(
  year: number,
  centsByMonth: ReadonlyMap<number, number>,
  from: number,
  to: number,
): RhythmMonth[] {
  return Array.from({ length: 12 }, (_, i): RhythmMonth => {
    const key = year * 12 + i
    const month = i + 1
    if (key < from) {
      return { month, state: 'before' }
    }
    if (key > to) {
      return { month, state: 'notYet' }
    }
    const cents = centsByMonth.get(key)
    return cents === undefined
      ? { month, state: 'noGift' }
      : { month, state: 'given', total: centsToRinggit(cents) }
  })
}

function giftStats(gifts: readonly Gift[]) {
  const centsByMonth = new Map<number, number>()
  let largest: Gift | undefined
  for (const gift of gifts) {
    const key = monthNumber(gift.createdAt)
    centsByMonth.set(key, (centsByMonth.get(key) ?? 0) + gift.amount)
    if (largest === undefined || gift.amount > largest.amount) {
      largest = gift
    }
  }

  return {
    centsByMonth,
    stats: {
      gifts: gifts.length,
      largest: largest
        ? {
            amount: centsToRinggit(largest.amount),
            date: largest.createdAt,
            funds: largest.items.map((item) => item.fundName),
          }
        : null,
      monthsGiven: centsByMonth.size,
      usualGift: centsToRinggit(median(gifts.map((gift) => gift.amount))),
    },
  }
}

function yearRhythm(gifts: readonly Gift[], year: number, now: TZDate) {
  const monthsSoFar = now.getFullYear() === year ? now.getMonth() + 1 : 12
  const { centsByMonth, stats } = giftStats(gifts)
  return {
    ...stats,
    kind: 'year' as const,
    months: rhythmMonths(year, centsByMonth, year * 12, year * 12 + monthsSoFar - 1),
    monthsSoFar,
  }
}

function allRhythm(gifts: readonly Gift[], now: TZDate) {
  const { centsByMonth, stats } = giftStats(gifts)
  const firstGift = earliestGift(gifts)?.createdAt ?? null
  const to = monthNumber(now)
  const from = firstGift ? monthNumber(firstGift) : to
  const currentYear = now.getFullYear()
  return {
    ...stats,
    firstGift,
    kind: 'all' as const,
    monthsSoFar: to - from + 1,
    years: Array.from({ length: currentYear - Math.floor(from / 12) + 1 }, (_, i) => ({
      months: rhythmMonths(currentYear - i, centsByMonth, from, to),
      year: currentYear - i,
    })),
  }
}

function repeatable(rows: readonly NewestItemRow[]) {
  const [first] = rows
  if (first === undefined) {
    return null
  }
  const cents = new Map<Fund, number>()
  for (const row of rows) {
    const fund = fundOf(row.fundName)
    if (fund) {
      cents.set(fund, (cents.get(fund) ?? 0) + row.amount)
    }
  }
  if (cents.size === 0) {
    return null
  }
  const give: GiveSearch = Object.fromEntries(
    [...cents].map(([fund, amount]) => [fund, centsToRinggit(amount)]),
  )
  return {
    amount: centsToRinggit(first.giftAmount),
    date: first.createdAt,
    give,
    items: rows.map((row) => ({ amount: centsToRinggit(row.amount), fundName: row.fundName })),
  }
}

function failedGift(rows: readonly NewestItemRow[], now: TZDate) {
  const [newest] = rows
  const failed = newest?.status === 'failed' || newest?.status === 'cancelled'
  const fresh =
    newest !== undefined &&
    newest.createdAt.getTime() > addDays(now, -FAILED_GIFT_NOTICE_DAYS).getTime()
  return failed && fresh ? repeatable(rows) : null
}

const yearMonth = (date: TZDate) =>
  `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`

function expiringCard(cards: readonly CardRow[], now: TZDate) {
  const nextMonth = new TZDate(now.getFullYear(), now.getMonth() + 1, 1, clientTz)
  const window = new Set([yearMonth(now), yearMonth(nextMonth)])
  const card = cards.find((saved) => window.has(saved.cardExp))
  return card
    ? {
        cardType: card.cardType,
        expires: { month: Number(card.cardExp.slice(4)), year: Number(card.cardExp.slice(0, 4)) },
        last4: card.cardNoMask.slice(-4),
      }
    : null
}

export interface OverviewRows {
  readonly cards: readonly CardRow[]
  readonly giftItems: readonly GiftItemRow[]
  readonly newestAny: readonly NewestItemRow[]
  readonly newestSuccess: readonly NewestItemRow[]
  readonly recent: readonly RecentRow[]
}

export function summarizeOverview(year: OverviewYear, rows: OverviewRows, now: Date) {
  const today = new TZDate(now, clientTz)
  const gifts = groupGifts(rows.giftItems)
  const shown = year === 'all' ? gifts : gifts.filter((gift) => klYear(gift.createdAt) === year)
  const includesToday = year === 'all' || year === today.getFullYear()

  return {
    funds: fundShares(shown),
    giveAgain: includesToday ? repeatable(rows.newestSuccess) : null,
    hero: year === 'all' ? allHero(gifts, today) : yearHero(gifts, year, today),
    notices: {
      expiringCard: includesToday ? expiringCard(rows.cards, today) : null,
      failedGift: includesToday ? failedGift(rows.newestAny, today) : null,
    },
    recent: rows.recent.map((row) => ({
      amount: centsToRinggit(row.amount),
      createdAt: row.createdAt,
      funds: [...row.funds],
      id: row.id,
      status: row.status,
    })),
    rhythm: year === 'all' ? allRhythm(gifts, today) : yearRhythm(shown, year, today),
  }
}
