import { describe, expect, it } from 'vitest'

import { createFakeDb } from '#/server/testing/fake-db'

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
import {
  findOwnTransaction,
  loadAvailableYears,
  loadOverview,
  loadTransactionsPage,
} from './history.server'

const transaction = {
  amount: 5000,
  createdAs: 'user' as const,
  createdAt: new Date('2025-02-01T02:00:00Z'),
  id: 'T2000000000000000001',
  status: 'success' as const,
  updatedAt: new Date('2025-02-01T02:05:00Z'),
  userId: 2,
}
const items = [{ amountInCents: 5000, fundName: 'Tithe' }]

function dbWith(row: typeof transaction | null, itemRows: typeof items) {
  return createFakeDb()
    .on(transactionById, (id) => (row?.id === id ? row : null))
    .on(transactionItemsOf, () => itemRows)
}

describe('a transaction detail', () => {
  it('is shown to the donor who made it, with its items', async () => {
    expect.hasAssertions()

    const db = dbWith(transaction, items)

    await expect(
      findOwnTransaction({ db }, { transactionId: transaction.id, viewerId: 2 }),
    ).resolves.toStrictEqual([transaction, items])
    expect(db.roundTrips).toStrictEqual([[transactionById.queryName, transactionItemsOf.queryName]])
  })

  it.each([
    { case: 'another donor', itemRows: items, row: transaction, viewerId: 3 },
    { case: 'a signed-out viewer', itemRows: items, row: transaction, viewerId: undefined },
    { case: 'a missing transaction', itemRows: items, row: null, viewerId: 2 },
    { case: 'a transaction without items', itemRows: [], row: transaction, viewerId: 2 },
  ])('is hidden from $case', async ({ itemRows, row, viewerId }) => {
    expect.hasAssertions()

    await expect(
      findOwnTransaction(
        { db: dbWith(row, itemRows) },
        { transactionId: transaction.id, viewerId },
      ),
    ).resolves.toBeNull()
  })
})

const donor = { id: 2, journey: 'start_fresh' as const }
const row = {
  amount: 5000,
  createdAt: transaction.createdAt,
  id: transaction.id,
  status: 'success' as const,
}

describe('the overview', () => {
  it('reads one Kuala Lumpur year in one round trip and summarizes it', async () => {
    expect.hasAssertions()

    const db = createFakeDb()
      .on(recentTransactions, () => [row])
      .on(successTimeline, () => [{ amount: 5000, createdAt: row.createdAt }])
      .on(successFundItems, () => [
        { createdAt: row.createdAt, fundId: 'fund_tithe', fundName: 'Tithe' },
      ])

    const overview = await loadOverview({ db }, { donor, year: 2025 })

    expect(overview.transactions).toStrictEqual([row])
    expect(overview.summary).toMatchObject({ noOfContributions: 1, totalAmount: 50 })
    expect(db.roundTrips).toStrictEqual([
      [recentTransactions.queryName, successTimeline.queryName, successFundItems.queryName],
    ])
    expect(db.calls[0]?.args).toStrictEqual([
      {
        donor,
        endExclusive: new Date('2025-12-31T16:00:00Z'),
        start: new Date('2024-12-31T16:00:00Z'),
      },
    ])
  })
})

describe('the available years', () => {
  it('are the years the donor gave in', async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(successYears, () => [2024, 2025])

    await expect(loadAvailableYears({ db }, donor)).resolves.toStrictEqual([2024, 2025])
    expect(db.calls).toStrictEqual([{ args: [donor], name: successYears.queryName }])
  })
})

describe('a transactions page', () => {
  it('reads the count and the page in one round trip', async () => {
    expect.hasAssertions()

    const db = createFakeDb()
      .on(countTransactions, () => [{ value: 21 }])
      .on(transactionsPage, () => [row])

    await expect(loadTransactionsPage({ db }, { donor, page: 2 })).resolves.toStrictEqual({
      pageSize: 20,
      totalCount: 21,
      transactions: [row],
    })
    expect(db.roundTrips).toStrictEqual([[countTransactions.queryName, transactionsPage.queryName]])
    expect(db.calls[1]?.args).toStrictEqual([donor, { limit: 20, offset: 20 }])
  })
})
