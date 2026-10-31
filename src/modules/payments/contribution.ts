import type { Fund } from '#/core/brand/funds'
import { ringgitToCents } from '#/core/money'
import type { User } from '#/modules/account/server'
import type { QueryResult } from '#/server/db.server'

import type { findFundsByName, TransactionId } from './transactions.repository.server'

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

/** Throws when a fund is missing from `funds`. */
export function itemsFor(
  transactionId: TransactionId,
  items: readonly ContributionItem[],
  funds: QueryResult<typeof findFundsByName>,
) {
  const fundIds = new Map(funds.map((f) => [f.name, f.id]))

  return items.map((item) => {
    const name = fundName(item.fund)
    const fundId = fundIds.get(name)
    if (fundId === undefined) {
      throw new Error(`Invalid fund name: ${name}`)
    }
    return { amount: item.amountInCents, fundId, transactionId }
  })
}
