import { Result } from 'better-result'
import { Type } from 'typebox'
import { Compile } from 'typebox/compile'

import { requireUser } from '#/server/authorize.server'
import type { Deps } from '#/server/deps.server'
import type { Parsed } from '#/server/input.server'
import { noInput, parseWith } from '#/server/input.server'
import { defineRead, toNotFound } from '#/server/procedure.server'

import { TransactionNotFound } from './history.errors'
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

/** One neon-http round trip for the three reads, then pure aggregation. */
export async function loadOverview(
  deps: Pick<Deps, 'db'>,
  input: { readonly donor: Donor; readonly year: OverviewYear },
) {
  const scope = scopeFor(input.donor, input.year)
  const read = await deps.db.batch([
    recentTransactions(scope),
    successTimeline(scope),
    successFundItems(scope),
  ])
  return read.map(([recent, timeline, fundItems]) => summarizeOverview(recent, timeline, fundItems))
}

export function loadAvailableYears(deps: Pick<Deps, 'db'>, donor: Donor) {
  return deps.db.run(successYears(donor))
}

export async function loadTransactionsPage(
  deps: Pick<Deps, 'db'>,
  input: { readonly donor: Donor; readonly page: number },
) {
  const read = await deps.db.batch([
    countTransactions(input.donor),
    transactionsPage(input.donor, { limit: PAGE_SIZE, offset: PAGE_SIZE * (input.page - 1) }),
  ])
  return read.map(([total, txs]) => toTransactionsPage(total, txs))
}

/** The transaction and its items, if it has items and belongs to the viewer. */
export async function findOwnTransaction(
  deps: Pick<Deps, 'db'>,
  input: { readonly transactionId: TransactionId; readonly viewerId: Donor['id'] },
) {
  const read = await deps.db.batch([
    transactionById(input.transactionId),
    transactionItemsOf(input.transactionId),
  ])
  return read.andThen(([transaction, items]) =>
    transaction === null || transaction.userId !== input.viewerId || items.length === 0
      ? Result.err(new TransactionNotFound())
      : Result.ok([transaction, items] as const),
  )
}

const overviewInput = parseWith(
  Compile(Type.Object({ year: Type.Union([Type.Literal('all'), Type.Integer()]) })),
)
export type OverviewInput = Parsed<typeof overviewInput>

export const getOverviewAction = defineRead({
  auth: requireUser,
  event: 'history.overview',
  input: overviewInput,
  run: ({ deps, user }, { year }) =>
    loadOverview(deps, { donor: { id: user.id, journey: user.journey }, year }),
  wire: {},
})

export const getAvailableYearsAction = defineRead({
  auth: requireUser,
  event: 'history.available_years',
  input: noInput,
  run: ({ deps, user }) => loadAvailableYears(deps, { id: user.id, journey: user.journey }),
  wire: {},
})

const transactionsInput = parseWith(Compile(Type.Object({ page: Type.Optional(Type.Integer()) })))
export type TransactionsInput = Parsed<typeof transactionsInput>

export const getTransactionsAction = defineRead({
  auth: requireUser,
  event: 'history.transactions',
  input: transactionsInput,
  run: ({ deps, user }, { page }) =>
    loadTransactionsPage(deps, { donor: { id: user.id, journey: user.journey }, page: page ?? 1 }),
  wire: {},
})

const transactionInput = parseWith(Compile(Type.Object({ transactionId: Type.String() })))
export type TransactionInput = Parsed<typeof transactionInput>

export const getTransactionAction = defineRead({
  auth: requireUser,
  event: 'history.transaction',
  input: transactionInput,
  run: ({ deps, user }, { transactionId }) =>
    findOwnTransaction(deps, { transactionId, viewerId: user.id }),
  wire: { TransactionNotFound: () => toNotFound() },
})
