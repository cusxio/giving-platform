import { Result } from 'better-result'
import { Type } from 'typebox'
import { Compile } from 'typebox/compile'

import { now } from '#/core/date'
import { COUNTED_STATUS, TRANSACTION_STATUSES } from '#/core/transaction-status'
import { unexpiredSavedCards } from '#/modules/payments/server'
import { requireUser } from '#/server/authorize.server'
import type { Deps } from '#/server/deps.server'
import type { Parsed } from '#/server/input.server'
import { noInput, parseWith } from '#/server/input.server'
import { defineRead, toNotFound } from '#/server/procedure.server'

import { TransactionNotFound } from './history.errors'
import type { Donor, TransactionId } from './history.repository.server'
import {
  countTransactions,
  newestGiftItems,
  recentTransactions,
  successGiftItems,
  successYears,
  transactionById,
  transactionItemsOf,
  transactionsPage,
} from './history.repository.server'
import type { OverviewYear } from './overview'
import { giftScopeFor, scopeFor, summarizeOverview } from './overview'
import { PAGE_SIZE, toTransactionsPage } from './transactions-page'

/** One neon-http round trip for every read, then pure aggregation as of `now`. */
export async function loadOverview(
  deps: Pick<Deps, 'db'>,
  input: { readonly donor: Donor; readonly now: Date; readonly year: OverviewYear },
) {
  const { donor, year } = input
  const read = await deps.db.batch([
    successGiftItems(giftScopeFor(donor, year)),
    recentTransactions(scopeFor(donor, year)),
    newestGiftItems(donor, TRANSACTION_STATUSES),
    newestGiftItems(donor, [COUNTED_STATUS]),
    unexpiredSavedCards(donor.id),
  ])
  return read.map(([giftItems, recent, newestAny, newestSuccess, cards]) =>
    summarizeOverview(year, { cards, giftItems, newestAny, newestSuccess, recent }, input.now),
  )
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
    loadOverview(deps, { donor: { id: user.id, journey: user.journey }, now: now(), year }),
  wire: {},
})

export const getAvailableYearsAction = defineRead({
  auth: requireUser,
  event: 'history.available_years',
  input: noInput,
  run: ({ deps, user }) => loadAvailableYears(deps, { id: user.id, journey: user.journey }),
  wire: {},
})

// A page past the safe integers would reach the database as an imprecise offset.
const page = Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: Number.MIN_SAFE_INTEGER })
const transactionsInput = parseWith(Compile(Type.Object({ page: Type.Optional(page) })))
export type TransactionsInput = Parsed<typeof transactionsInput>

export const getTransactionsAction = defineRead({
  auth: requireUser,
  event: 'history.transactions',
  input: transactionsInput,
  run: ({ deps, user }, { page }) =>
    loadTransactionsPage(deps, {
      donor: { id: user.id, journey: user.journey },
      page: Math.max(1, page ?? 1),
    }),
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
