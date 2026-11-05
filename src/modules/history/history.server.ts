import { notFound } from '@tanstack/react-router'

import type { QueryResult } from '#/server/db.server'
import type { Deps } from '#/server/deps.server'
import type { RequestContext } from '#/server/request-context.server'

import type { Donor, TransactionId } from './history.repository.server'
import {
  countTransactions,
  recentTransactions,
  successFundItems,
  successTimeline,
  successYears,
  transactionById,
  transactionItemsOf,
  transactionsPage,
} from './history.repository.server'
import type { OverviewYear } from './overview'
import { scopeFor, summarizeOverview } from './overview'
import { PAGE_SIZE, toTransactionsPage } from './transactions-page'

type Ctx = Pick<RequestContext, 'deps' | 'user'>

export interface OverviewInput {
  readonly journey: Donor['journey']
  readonly year: OverviewYear
}

export interface AvailableYearsInput {
  readonly journey: Donor['journey']
}

export interface TransactionsInput {
  readonly journey: Donor['journey']
  readonly page?: number
}

export interface TransactionInput {
  readonly transactionId: TransactionId
}

type TransactionDetail = readonly [
  NonNullable<QueryResult<typeof transactionById>>,
  QueryResult<typeof transactionItemsOf>,
]

/** One neon-http round trip for the three reads, then pure aggregation. */
export async function loadOverview(
  deps: Pick<Deps, 'db'>,
  input: { readonly donor: Donor; readonly year: OverviewYear },
) {
  const scope = scopeFor(input.donor, input.year)
  const [recent, timeline, fundItems] = await deps.db.batch([
    recentTransactions(scope),
    successTimeline(scope),
    successFundItems(scope),
  ])
  return summarizeOverview(recent, timeline, fundItems)
}

export function loadAvailableYears(deps: Pick<Deps, 'db'>, donor: Donor): Promise<number[]> {
  return deps.db.run(successYears(donor))
}

export async function loadTransactionsPage(
  deps: Pick<Deps, 'db'>,
  input: { readonly donor: Donor; readonly page: number },
) {
  const [total, txs] = await deps.db.batch([
    countTransactions(input.donor),
    transactionsPage(input.donor, { limit: PAGE_SIZE, offset: PAGE_SIZE * (input.page - 1) }),
  ])
  return toTransactionsPage(total, txs)
}

/** Null unless the transaction exists, has items, and belongs to the viewer. */
export async function findOwnTransaction(
  deps: Pick<Deps, 'db'>,
  input: { readonly transactionId: TransactionId; readonly viewerId: Donor['id'] | undefined },
): Promise<TransactionDetail | null> {
  const [transaction, items] = await deps.db.batch([
    transactionById(input.transactionId),
    transactionItemsOf(input.transactionId),
  ])
  if (transaction === null || transaction.userId !== input.viewerId || items.length === 0) {
    return null
  }
  return [transaction, items]
}

// Transport adapters. Phase 2 replaces the null-user guard with `requireUser` middleware.

export async function getOverviewProcedure(context: Ctx, data: OverviewInput) {
  if (!context.user) {
    throw notFound()
  }
  return loadOverview(context.deps, {
    donor: { id: context.user.id, journey: data.journey },
    year: data.year,
  })
}

export async function getAvailableYearsProcedure(
  context: Ctx,
  data: AvailableYearsInput,
): Promise<number[]> {
  if (!context.user) {
    throw notFound()
  }
  return loadAvailableYears(context.deps, { id: context.user.id, journey: data.journey })
}

export async function getTransactionsProcedure(context: Ctx, data: TransactionsInput) {
  const { page = 1, journey } = data
  if (!context.user) {
    throw notFound()
  }
  return loadTransactionsPage(context.deps, { donor: { id: context.user.id, journey }, page })
}

export async function getTransactionProcedure(
  context: Ctx,
  data: TransactionInput,
): Promise<TransactionDetail> {
  const detail = await findOwnTransaction(context.deps, {
    transactionId: data.transactionId,
    viewerId: context.user?.id,
  })
  if (detail === null) {
    throw notFound()
  }
  return detail
}
