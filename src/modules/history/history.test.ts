import { isNotFound, isRedirect } from '@tanstack/react-router'
import { describe, expect, expectTypeOf, it } from 'vitest'

import type { QueryResult } from '#/server/db.server'
import { createFakeDb } from '#/server/testing/fake-db'
import { recordingLogger } from '#/server/testing/recording-logger'
import { errValue, okValue } from '#/server/testing/result'
import { MEMBER, testContext } from '#/server/testing/test-context'

import { TransactionNotFound } from './history.errors'
import type {
  getAvailableYears,
  getOverview,
  getTransaction,
  getTransactions,
} from './history.functions'
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
import type { OverviewInput, TransactionInput, TransactionsInput } from './history.server'
import {
  findOwnTransaction,
  getAvailableYearsAction,
  getOverviewAction,
  getTransactionAction,
  getTransactionsAction,
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

const donor = { id: 2, journey: 'start_fresh' as const }
const row = {
  amount: 5000,
  createdAt: transaction.createdAt,
  id: transaction.id,
  status: 'success' as const,
}
/** A session whose journey differs from what a client might still send. */
const migrating = { ...MEMBER, journey: 'migrate' as const }

const overviewDb = () =>
  createFakeDb()
    .on(recentTransactions, () => [row])
    .on(successTimeline, () => [{ amount: 5000, createdAt: row.createdAt }])
    .on(successFundItems, () => [
      { createdAt: row.createdAt, fundId: 'fund_tithe', fundName: 'Tithe' },
    ])
const pageDb = () =>
  createFakeDb()
    .on(countTransactions, () => [{ value: 21 }])
    .on(transactionsPage, () => [row])

interface Row {
  amount: number
  createdAt: Date
  id: string
  status: 'failed' | 'pending' | 'success'
}

describe('a transaction detail', () => {
  it('is shown to the donor who made it, with its items', async () => {
    expect.hasAssertions()

    const db = dbWith(transaction, items)

    expect(
      okValue(await findOwnTransaction({ db }, { transactionId: transaction.id, viewerId: 2 })),
    ).toStrictEqual([transaction, items])
    expect(db.roundTrips).toStrictEqual([[transactionById.queryName, transactionItemsOf.queryName]])
  })

  it.each([
    { case: 'another donor', itemRows: items, row: transaction, viewerId: 3 },
    { case: 'a missing transaction', itemRows: items, row: null, viewerId: 2 },
    { case: 'a transaction without items', itemRows: [], row: transaction, viewerId: 2 },
  ])('is not found for $case', async ({ itemRows, row, viewerId }) => {
    expect.hasAssertions()

    const db = dbWith(row, itemRows)

    expect(
      errValue(await findOwnTransaction({ db }, { transactionId: transaction.id, viewerId })),
    ).toBeInstanceOf(TransactionNotFound)
  })

  it('answers the signed-in owner and hides it from anyone else', async () => {
    expect.hasAssertions()

    const db = dbWith(transaction, items)
    const data = { transactionId: transaction.id }
    expectTypeOf<TransactionInput>().toEqualTypeOf<{ transactionId: string }>()
    expectTypeOf<Awaited<ReturnType<typeof getTransaction>>>().toEqualTypeOf<
      readonly [
        NonNullable<QueryResult<typeof transactionById>>,
        { amountInCents: number; fundName: string }[],
      ]
    >()

    await expect(
      getTransactionAction({ context: testContext(MEMBER, { db }), data }),
    ).resolves.toStrictEqual([transaction, items])
    const other = await getTransactionAction({
      context: testContext({ ...MEMBER, id: 3 }, { db }),
      data,
    }).catch((error: unknown) => error)
    const guest = await getTransactionAction({ context: testContext(null, { db }), data }).catch(
      (error: unknown) => error,
    )

    expect(isNotFound(other)).toBe(true)
    expect(isRedirect(guest)).toBe(true)
    expect(guest).toMatchObject({ options: { to: '/auth/login' } })
    expect(db.roundTrips).toHaveLength(2)
  })

  it('logs a failed read and answers a generic error', async () => {
    expect.hasAssertions()

    const { events, logger } = recordingLogger()
    const db = createFakeDb()
      .on(transactionById, () => transaction)
      .on(transactionItemsOf, () => {
        throw new Error('relation "transaction_items" does not exist')
      })

    await expect(
      getTransactionAction({
        context: testContext(MEMBER, { db, logger }),
        data: { transactionId: transaction.id },
      }),
    ).rejects.toThrow(new Error('Internal Server Error'))
    expect(events).toMatchObject([
      {
        event: 'history.transaction.failed',
        op: `${transactionById.queryName} + ${transactionItemsOf.queryName}`,
      },
    ])
  })
})

describe('the overview', () => {
  it('reads one Kuala Lumpur year in one round trip and summarizes it', async () => {
    expect.hasAssertions()

    const db = overviewDb()

    const overview = okValue(await loadOverview({ db }, { donor, year: 2025 }))

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

  it("reads the signed-in donor's own journey, whatever the client sends", async () => {
    expect.hasAssertions()

    const db = overviewDb()
    expectTypeOf<OverviewInput>().toEqualTypeOf<{ year: 'all' | number }>()
    expectTypeOf<Awaited<ReturnType<typeof getOverview>>>().toEqualTypeOf<{
      cumulativeContributions: { cumulativeAmount: number; day: string }[]
      monthlyContributions: { month: number; totalAmount: number }[]
      monthlyContributionsFrequency: { [fund: string]: number; month: number }[]
      summary: {
        averageAmount: number
        largestAmount: number
        largestAmountDate: Date | null
        noOfContributions: number
        totalAmount: number
        totalFundsSupported: number
      }
      transactions: Row[]
    }>()

    const overview = await getOverviewAction({
      context: testContext(migrating, { db }),
      data: { journey: 'start_fresh', year: 'all' },
    })

    expect(overview.transactions).toStrictEqual([row])
    expect(db.calls[0]?.args).toStrictEqual([
      { donor: { id: 2, journey: 'migrate' }, endExclusive: undefined, start: undefined },
    ])
  })

  it('redirects a signed-out caller to login without reading', async () => {
    expect.hasAssertions()

    const db = overviewDb()

    const guest = await getOverviewAction({
      context: testContext(null, { db }),
      data: { year: 'all' },
    }).catch((error: unknown) => error)

    expect(isRedirect(guest)).toBe(true)
    expect(guest).toMatchObject({ options: { to: '/auth/login' } })
    expect(db.calls).toStrictEqual([])
  })

  it('refuses a year that is not a calendar year or all, without reading', async () => {
    expect.hasAssertions()

    const { events, logger } = recordingLogger()
    const db = overviewDb()

    await expect(
      getOverviewAction({ context: testContext(MEMBER, { db, logger }), data: { year: '2025' } }),
    ).rejects.toThrow(new Error('Invalid input'))
    expect(events).toMatchObject([{ event: 'history.overview.validation_failed' }])
    expect(db.calls).toStrictEqual([])
  })

  it('logs a failed read and answers a generic error', async () => {
    expect.hasAssertions()

    const { events, logger } = recordingLogger()
    const db = overviewDb().on(successFundItems, () => {
      throw new Error('relation "transaction_items" does not exist')
    })

    await expect(
      getOverviewAction({ context: testContext(MEMBER, { db, logger }), data: { year: 'all' } }),
    ).rejects.toThrow(new Error('Internal Server Error'))
    expect(events).toMatchObject([
      {
        event: 'history.overview.failed',
        op: `${recentTransactions.queryName} + ${successTimeline.queryName} + ${successFundItems.queryName}`,
      },
    ])
  })
})

describe('the available years', () => {
  it('are the years the donor gave in', async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(successYears, () => [2024, 2025])

    expect(okValue(await loadAvailableYears({ db }, donor))).toStrictEqual([2024, 2025])
    expect(db.calls).toStrictEqual([{ args: [donor], name: successYears.queryName }])
  })

  it("read the signed-in donor's own journey and redirect a signed-out caller", async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(successYears, () => [2024, 2025])
    expectTypeOf<Awaited<ReturnType<typeof getAvailableYears>>>().toEqualTypeOf<number[]>()

    await expect(
      getAvailableYearsAction({
        context: testContext(migrating, { db }),
        data: { journey: 'start_fresh' },
      }),
    ).resolves.toStrictEqual([2024, 2025])
    const guest = await getAvailableYearsAction({ context: testContext(null, { db }) }).catch(
      (error: unknown) => error,
    )

    expect(isRedirect(guest)).toBe(true)
    expect(db.calls).toStrictEqual([
      { args: [{ id: 2, journey: 'migrate' }], name: successYears.queryName },
    ])
  })

  it('log a failed read and answer a generic error', async () => {
    expect.hasAssertions()

    const { events, logger } = recordingLogger()
    const db = createFakeDb().on(successYears, () => {
      throw new Error('relation "transactions" does not exist')
    })

    await expect(
      getAvailableYearsAction({ context: testContext(MEMBER, { db, logger }) }),
    ).rejects.toThrow(new Error('Internal Server Error'))
    expect(events).toMatchObject([
      { event: 'history.available_years.failed', op: successYears.queryName },
    ])
  })
})

describe('a transactions page', () => {
  it('reads the count and the page in one round trip', async () => {
    expect.hasAssertions()

    const db = pageDb()

    expect(okValue(await loadTransactionsPage({ db }, { donor, page: 2 }))).toStrictEqual({
      pageSize: 20,
      totalCount: 21,
      transactions: [row],
    })
    expect(db.roundTrips).toStrictEqual([[countTransactions.queryName, transactionsPage.queryName]])
    expect(db.calls[1]?.args).toStrictEqual([donor, { limit: 20, offset: 20 }])
  })

  it("reads the signed-in donor's own journey, from page 1 by default", async () => {
    expect.hasAssertions()

    const db = pageDb()
    expectTypeOf<TransactionsInput>().toEqualTypeOf<{ page?: number }>()
    expectTypeOf<Awaited<ReturnType<typeof getTransactions>>>().toEqualTypeOf<{
      pageSize: number
      totalCount: number
      transactions: Row[]
    }>()

    await expect(
      getTransactionsAction({
        context: testContext(migrating, { db }),
        data: { journey: 'start_fresh' },
      }),
    ).resolves.toStrictEqual({ pageSize: 20, totalCount: 21, transactions: [row] })
    expect(db.calls[1]?.args).toStrictEqual([
      { id: 2, journey: 'migrate' },
      { limit: 20, offset: 0 },
    ])
  })

  it.each([0, -1])('reads page 1 when asked for page %i', async (page) => {
    expect.hasAssertions()

    const db = pageDb()

    await expect(
      getTransactionsAction({ context: testContext(MEMBER, { db }), data: { page } }),
    ).resolves.toStrictEqual({ pageSize: 20, totalCount: 21, transactions: [row] })
    expect(db.calls[1]?.args).toStrictEqual([donor, { limit: 20, offset: 0 }])
  })

  it('refuses a page that is not an integer, without reading', async () => {
    expect.hasAssertions()

    const { events, logger } = recordingLogger()
    const db = pageDb()

    await expect(
      getTransactionsAction({ context: testContext(MEMBER, { db, logger }), data: { page: 1.5 } }),
    ).rejects.toThrow(new Error('Invalid input'))
    expect(events).toMatchObject([{ event: 'history.transactions.validation_failed' }])
    expect(db.calls).toStrictEqual([])
  })

  it('redirects a signed-out caller to login without reading', async () => {
    expect.hasAssertions()

    const db = pageDb()

    const guest = await getTransactionsAction({
      context: testContext(null, { db }),
      data: { page: 1 },
    }).catch((error: unknown) => error)

    expect(isRedirect(guest)).toBe(true)
    expect(guest).toMatchObject({ options: { to: '/auth/login' } })
    expect(db.calls).toStrictEqual([])
  })

  it('logs a failed read and answers a generic error', async () => {
    expect.hasAssertions()

    const { events, logger } = recordingLogger()
    const db = pageDb().on(countTransactions, () => {
      throw new Error('relation "transactions" does not exist')
    })

    await expect(
      getTransactionsAction({ context: testContext(MEMBER, { db, logger }), data: { page: 1 } }),
    ).rejects.toThrow(new Error('Internal Server Error'))
    expect(events).toMatchObject([
      {
        event: 'history.transactions.failed',
        op: `${countTransactions.queryName} + ${transactionsPage.queryName}`,
      },
    ])
  })
})
