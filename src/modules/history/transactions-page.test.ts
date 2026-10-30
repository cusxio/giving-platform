import { describe, expect, it } from 'vitest'

import { toTransactionsPage } from './transactions-page'

const page = [
  {
    amount: 5000,
    createdAt: new Date('2025-02-01T02:00:00Z'),
    id: 'txn_1',
    status: 'success' as const,
  },
  {
    amount: 700,
    createdAt: new Date('2025-01-31T15:00:00Z'),
    id: 'txn_2',
    status: 'failed' as const,
  },
]

describe('transactions page', () => {
  it('reports the total count and a page size of 20, and keeps rows in cents', () => {
    expect.hasAssertions()

    expect(toTransactionsPage([{ value: 42 }], page)).toStrictEqual({
      pageSize: 20,
      totalCount: 42,
      transactions: page,
    })
  })

  it('counts zero when the count query returns no row', () => {
    expect.hasAssertions()

    expect(toTransactionsPage([], [])).toStrictEqual({
      pageSize: 20,
      totalCount: 0,
      transactions: [],
    })
  })
})
