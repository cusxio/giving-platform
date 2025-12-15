import { centsToRinggit } from '#/core/money'

import { InsightsRepository } from './insights.repository'

export function formatTransactionSummary(
  contributionStats:
    | Awaited<ReturnType<InsightsRepository['transactionSummaryQuery']>>[0]
    | undefined,
) {
  return {
    totalAmount: centsToRinggit(contributionStats?.totalAmount ?? 0),
    noOfContributions: contributionStats?.noOfContributions ?? 0,
    averageAmount: centsToRinggit(contributionStats?.averageAmount ?? 0),
  }
}
