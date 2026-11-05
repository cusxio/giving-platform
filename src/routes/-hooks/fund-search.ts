import { funds } from '#/core/brand'
import type { Fund } from '#/core/brand/funds'
import { MAX_FUND_AMOUNT } from '#/modules/payments'

export type FundSearch = Partial<Record<Fund, number>>

export interface LinkedGift {
  /** The amounts the link fills in, as the form stores them, such as `{ tithe: '50' }`. */
  readonly amounts: Partial<Record<Fund, string>>
  /** The funds whose linked amount is past the most one fund may receive. */
  readonly overMax: readonly Fund[]
}

/** A non-negative amount in ringgit with at most two decimals, such as `50` or `12.5`. */
function amountFrom(param: unknown): number | undefined {
  const amount =
    typeof param === 'string' && /^\d+(?:\.\d{1,2})?$/u.test(param) ? Number(param) : param
  return typeof amount === 'number' &&
    Number.isFinite(amount) &&
    amount >= 0 &&
    Math.round(amount * 100) / 100 === amount
    ? amount
    : undefined
}

/**
 * Each fund's amount from the URL, such as `?tithe=50`, leaving out one that is not an amount.
 * Every fund is named, even as `undefined`, because the router keeps a raw param the route omits.
 */
export function parseFundSearch(search: Record<string, unknown>): FundSearch {
  return Object.fromEntries(funds.map((fund) => [fund, amountFrom(search[fund])]))
}

export function linkedGift(search: FundSearch): LinkedGift {
  const amounts: Partial<Record<Fund, string>> = {}
  const overMax: Fund[] = []
  for (const fund of funds) {
    const amount = search[fund]
    if (amount === undefined || amount === 0) {
      continue
    }
    if (amount > MAX_FUND_AMOUNT) {
      overMax.push(fund)
    } else {
      amounts[fund] = String(amount)
    }
  }
  return { amounts, overMax }
}

/** Whether the link has an amount for some fund and none past the maximum. */
export const opensOnDetails = (gift: LinkedGift) =>
  Object.keys(gift.amounts).length > 0 && gift.overMax.length === 0
