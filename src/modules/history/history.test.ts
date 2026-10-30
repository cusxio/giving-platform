import { describe, expect, it } from 'vitest'

import { createFakeDb } from '#/server/testing/fake-db'

import { transactionById, transactionItemsOf } from './history.repository.server'
import { findOwnTransaction } from './history.server'

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
