import { centsToRinggit } from '#/core/money'

import type { DonorRow, Rate } from './donors'
import { REGULAR_MIN_MONTHS, classifyDonors } from './donors'
import { giftSizes } from './gift-bands'
import type { Period, Range, Windows } from './period'
import { shiftYears, trailingYear } from './period'

export type { Rate } from './donors'
export type { GiftBand } from './gift-bands'
export type { Range } from './period'

interface Compared<T> {
  readonly prior: T
  readonly value: T
}

interface Split {
  readonly amount: number
  readonly gifts: number
}

/**
 * Everything the Analytics page shows, in ringgit. It is anonymous by construction: counts, sums
 * and rates only, never a donor's id, email or name.
 */
export interface Analytics {
  readonly attention: { readonly held: number; readonly stalePending: number }
  readonly compare: Range
  readonly donors: {
    /** Donors who gave in both the period and the compare span. "Same" is within 10%. */
    readonly change: { readonly less: number; readonly more: number; readonly same: number }
    /** `null` without the history the window needs. */
    readonly gaveAgain: {
      readonly firstTime: Rate | null
      readonly repeat: Rate | null
      readonly window: Range
    }
    /** Gave in the year before the period, and not yet in it. */
    readonly notYet: number
    readonly regular: {
      readonly donors: number
      readonly minMonths: number
      /** Of the last 12 months' money, from 0 to 1. */
      readonly shareOfMoney: number
    }
    readonly segments: {
      readonly cameBack: number
      readonly new: number
      readonly returning: number
    }
  }
  readonly funds: readonly {
    readonly amount: number
    readonly fundName: string
    readonly gifts: number
    readonly guest: number
    readonly prior: number
    readonly signedIn: number
  }[]
  readonly giftSizes: ReturnType<typeof giftSizes>
  readonly kpis: {
    readonly donors: Compared<number>
    readonly gaveAgain: Compared<Rate | null>
    readonly gifts: Compared<number>
    readonly medianGift: Compared<number>
    readonly received: Compared<number>
  }
  readonly monthly: readonly {
    readonly amount: number
    readonly fundName: string
    readonly month: string
  }[]
  /** The compare span's months, moved one year on so each lines up with its month in the period. */
  readonly monthlyLastYear: readonly { readonly amount: number; readonly month: string }[]
  readonly payments: readonly {
    readonly cancelled: number
    readonly failed: number
    readonly method: string | null
    readonly succeeded: number
  }[]
  readonly period: Range
  readonly signedInGuest: { readonly guest: Split; readonly user: Split }
  /** All 56 cells: weekday 1 (Monday) to 7, block 0 (midnight to 3am) to 7. */
  readonly whenPeopleGive: readonly {
    readonly block: number
    readonly gifts: number
    readonly weekday: number
  }[]
}

interface TotalsRow {
  readonly donors: number
  readonly gifts: number
  readonly guestAmount: number
  readonly guestGifts: number
  readonly median: number
  readonly received: number
  readonly userAmount: number
  readonly userGifts: number
}

interface MonthRow {
  readonly amount: number
  readonly fundName: string
  readonly month: string
}

interface FundRow {
  readonly amount: number
  readonly fundName: string
  readonly gifts: number
  readonly guest: number
  readonly signedIn: number
}

interface BucketRow {
  readonly amount: number
  readonly bucket: number
  readonly gifts: number
}

export interface AnalyticsReads {
  readonly bands: readonly BucketRow[]
  readonly compareBands: readonly BucketRow[]
  readonly compareFunds: readonly FundRow[]
  readonly compareMonthly: readonly MonthRow[]
  readonly compareTotals: TotalsRow | null
  readonly donors: readonly DonorRow[]
  readonly funds: readonly FundRow[]
  readonly held: number
  readonly heatmap: readonly {
    readonly block: number
    readonly gifts: number
    readonly weekday: number
  }[]
  readonly monthly: readonly MonthRow[]
  readonly payments: Analytics['payments']
  readonly stalePending: number
  readonly totals: TotalsRow | null
}

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const
const BLOCKS = [0, 1, 2, 3, 4, 5, 6, 7] as const

function fundsTable(period: readonly FundRow[], compare: readonly FundRow[]): Analytics['funds'] {
  const names = new Set([...period, ...compare].map((row) => row.fundName))
  return (
    [...names]
      .map((fundName) => {
        const now = period.find((row) => row.fundName === fundName)
        const before = compare.find((row) => row.fundName === fundName)
        return {
          amount: centsToRinggit(now?.amount ?? 0),
          fundName,
          gifts: now?.gifts ?? 0,
          guest: centsToRinggit(now?.guest ?? 0),
          prior: centsToRinggit(before?.amount ?? 0),
          signedIn: centsToRinggit(now?.signedIn ?? 0),
        }
      })
      // oxlint-disable-next-line unicorn/no-array-sort -- Avoid toSorted until the runtime lib supports it.
      .sort((a, b) => b.amount - a.amount || b.prior - a.prior)
  )
}

function monthlyLastYear(rows: readonly MonthRow[]): Analytics['monthlyLastYear'] {
  const byMonth = new Map<string, number>()
  for (const row of rows) {
    const month = shiftYears(`${row.month}-01`, 1).slice(0, 7)
    byMonth.set(month, (byMonth.get(month) ?? 0) + row.amount)
  }
  return [...byMonth].map(([month, amount]) => ({ amount: centsToRinggit(amount), month }))
}

const compared = <T>(value: T, prior: T): Compared<T> => ({ prior, value })

export function toAnalytics(
  { compare, period }: Period,
  windows: Windows,
  reads: AnalyticsReads,
): Analytics {
  const donors = classifyDonors(reads.donors, windows)
  const { compareTotals: prior, totals } = reads
  return {
    attention: { held: reads.held, stalePending: reads.stalePending },
    compare,
    donors: {
      change: donors.change,
      gaveAgain: {
        firstTime: donors.gaveAgain.firstTime,
        repeat: donors.gaveAgain.repeat,
        window: trailingYear(period.end, 1),
      },
      notYet: donors.notYet,
      regular: { ...donors.regular, minMonths: REGULAR_MIN_MONTHS },
      segments: donors.segments,
    },
    funds: fundsTable(reads.funds, reads.compareFunds),
    giftSizes: giftSizes(reads.bands, reads.compareBands),
    kpis: {
      donors: compared(totals?.donors ?? 0, prior?.donors ?? 0),
      gaveAgain: compared(donors.gaveAgain.all.value, donors.gaveAgain.all.prior),
      gifts: compared(totals?.gifts ?? 0, prior?.gifts ?? 0),
      medianGift: compared(centsToRinggit(totals?.median ?? 0), centsToRinggit(prior?.median ?? 0)),
      received: compared(
        centsToRinggit(totals?.received ?? 0),
        centsToRinggit(prior?.received ?? 0),
      ),
    },
    monthly: reads.monthly.map((row) => ({ ...row, amount: centsToRinggit(row.amount) })),
    monthlyLastYear: monthlyLastYear(reads.compareMonthly),
    payments: reads.payments,
    period,
    signedInGuest: {
      guest: { amount: centsToRinggit(totals?.guestAmount ?? 0), gifts: totals?.guestGifts ?? 0 },
      user: { amount: centsToRinggit(totals?.userAmount ?? 0), gifts: totals?.userGifts ?? 0 },
    },
    whenPeopleGive: WEEKDAYS.flatMap((weekday) =>
      BLOCKS.map((block) => ({
        block,
        gifts:
          reads.heatmap.find((row) => row.weekday === weekday && row.block === block)?.gifts ?? 0,
        weekday,
      })),
    ),
  }
}
