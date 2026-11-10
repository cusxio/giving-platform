import { funds } from '#/core/brand'
import type { Fund } from '#/core/brand/funds'
import { MAX_FUND_AMOUNT } from '#/modules/payments'

export type FundSearch = Partial<Record<Fund, number>>

export interface LinkedGift {
  readonly amounts: Partial<Record<Fund, string>>
  readonly overMax: readonly Fund[]
}

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

/** Every fund is named, even as `undefined`, because the router keeps a raw param the route omits. */
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

export const opensOnDetails = (gift: LinkedGift) =>
  Object.keys(gift.amounts).length > 0 && gift.overMax.length === 0
