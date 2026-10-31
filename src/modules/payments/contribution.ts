import { Result } from 'better-result'

import type { Fund } from '#/core/brand/funds'
import { ringgitToCents } from '#/core/money'
import type { User } from '#/modules/account/server'

export interface ContributionItem {
  readonly amountInCents: number
  readonly fund: Fund
}

export function contributionItems(
  contributions: Readonly<Record<Fund, number>>,
): ContributionItem[] {
  return (Object.entries(contributions) as [Fund, number][])
    .map(([fund, amount]) => ({ amountInCents: ringgitToCents(amount), fund }))
    .filter((item) => item.amountInCents > 0)
}

export function totalInCents(items: readonly ContributionItem[]): number {
  return items.reduce((sum, item) => sum + item.amountInCents, 0)
}

/** The funds table names each fund with a leading capital, such as `Offering`. */
export function fundName(fund: Fund): string {
  return fund.charAt(0).toUpperCase() + fund.slice(1)
}

type DonorDecision =
  | { readonly kind: 'email-belongs-to-another-user' }
  | { readonly kind: 'guest' }
  | { readonly kind: 'guest-email-exists' }
  | { readonly kind: 'session-user'; readonly userId: User['id'] }

/**
 * A signed-in donor always gives as themselves, and may not use another account's email. A guest
 * may reuse a guest email but not a registered account's.
 */
export function decideDonor(
  owner: null | Pick<User, 'id' | 'status'>,
  sessionUser: null | Pick<User, 'id'>,
): DonorDecision {
  if (sessionUser) {
    return owner && owner.id !== sessionUser.id
      ? { kind: 'email-belongs-to-another-user' }
      : { kind: 'session-user', userId: sessionUser.id }
  }
  return owner && owner.status !== 'guest' ? { kind: 'guest-email-exists' } : { kind: 'guest' }
}

/** The transaction's item rows keyed by fund id, or `Err` naming the first fund `funds` lacks. */
export function itemsFor(
  transactionId: string,
  items: readonly ContributionItem[],
  funds: readonly { readonly id: string; readonly name: string }[],
): Result<{ amount: number; fundId: string; transactionId: string }[], string> {
  const fundIds = new Map(funds.map((f) => [f.name, f.id]))
  const rows = []
  for (const item of items) {
    const name = fundName(item.fund)
    const fundId = fundIds.get(name)
    if (fundId === undefined) {
      return Result.err(name)
    }
    rows.push({ amount: item.amountInCents, fundId, transactionId })
  }
  return Result.ok(rows)
}
