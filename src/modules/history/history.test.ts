import { isNotFound, isRedirect } from '@tanstack/react-router'
import { describe, expect, expectTypeOf, it } from 'vitest'

import { TRANSACTION_STATUSES } from '#/core/transaction-status'
import type { TransactionStatus } from '#/core/transaction-status'
import { unexpiredSavedCards } from '#/modules/payments/server'
import type { QueryResult } from '#/server/db.server'
import { createDriverDb } from '#/server/testing/driver-db'
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
  newestGiftItems,
  recentTransactions,
  successGiftItems,
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

const giftItem = {
  amount: 5000,
  createdAt: row.createdAt,
  fundName: 'Tithe',
  giftAmount: 5000,
  transactionId: row.id,
}
const savedCard = {
  cardExp: '202503',
  cardHolder: 'MEM BER',
  cardNoMask: '411111******4242',
  cardType: 'VISA',
  createdAt: row.createdAt,
  id: 7,
  lastUsedAt: row.createdAt,
  token: 'tok_visa',
  tokenType: 'OCP' as const,
  updatedAt: row.createdAt,
  userId: 2,
}
/** The newest gift failed; the newest success is `row`. */
const newestItem = (statuses: readonly TransactionStatus[]) => {
  const failed = statuses.length > 1
  return [
    {
      amount: failed ? 7000 : 5000,
      createdAt: failed ? new Date('2025-02-27T02:00:00Z') : row.createdAt,
      fundName: 'Tithe',
      giftAmount: failed ? 7000 : 5000,
      status: failed ? ('failed' as const) : ('success' as const),
    },
  ]
}
const overviewDb = () =>
  createFakeDb()
    .on(successGiftItems, () => [giftItem])
    .on(recentTransactions, () => [{ ...row, funds: ['Tithe'] }])
    .on(newestGiftItems, (_donor, statuses) => newestItem(statuses))
    .on(unexpiredSavedCards, () => [savedCard])
const overviewQueries = [
  successGiftItems.queryName,
  recentTransactions.queryName,
  newestGiftItems.queryName,
  newestGiftItems.queryName,
  unexpiredSavedCards.queryName,
]
/** 1 March 2025 in Kuala Lumpur. */
const MARCH_1 = new Date('2025-03-01T04:00:00Z')

const pageDb = () =>
  createFakeDb()
    .on(countTransactions, () => [{ value: 21 }])
    .on(transactionsPage, () => [row])

interface Row {
  amount: number
  createdAt: Date
  id: string
  status: 'cancelled' | 'failed' | 'held' | 'pending' | 'refunded' | 'success'
}

interface Repeatable {
  amount: number
  date: Date
  give: { future?: number; mission?: number; offering?: number; tithe?: number }
  items: { amount: number; fundName: string }[]
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

  it('lists the fund rows in the order they were added', async () => {
    expect.hasAssertions()

    const statements: { params: unknown[]; sql: string }[] = []
    const db = createDriverDb((sql, params) => {
      statements.push({ params, sql })
      return Promise.resolve({ rowCount: 0, rows: [] })
    })

    expect(okValue(await db.run(transactionItemsOf(transaction.id)))).toStrictEqual([])
    expect(statements).toStrictEqual([
      {
        params: [transaction.id],
        sql: [
          'select "transaction_items"."amount", "funds"."name" from "transaction_items"',
          'inner join "funds" on "funds"."id" = "transaction_items"."fund_id"',
          'where "transaction_items"."transaction_id" = $1 order by "transaction_items"."id" asc',
        ].join(' '),
      },
    ])
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
  it('reads everything for one Kuala Lumpur year in one round trip', async () => {
    expect.hasAssertions()

    const db = overviewDb()

    const overview = okValue(await loadOverview({ db }, { donor, now: MARCH_1, year: 2025 }))

    expect(db.roundTrips).toStrictEqual([overviewQueries])
    expect(db.calls.map((call) => call.args)).toStrictEqual([
      [
        {
          donor,
          endExclusive: new Date('2025-12-31T16:00:00Z'),
          start: new Date('2023-12-31T16:00:00Z'),
        },
      ],
      [
        {
          donor,
          endExclusive: new Date('2025-12-31T16:00:00Z'),
          start: new Date('2024-12-31T16:00:00Z'),
        },
      ],
      [donor, TRANSACTION_STATUSES],
      [donor, ['success']],
      [2],
    ])
    expect(overview).toMatchObject({
      funds: [{ amount: 50, fundName: 'Tithe', share: 1 }],
      giveAgain: { give: { tithe: 50 } },
      hero: { kind: 'year', today: 59, total: 50 },
      notices: {
        expiringCard: { cardType: 'VISA', expires: { month: 3, year: 2025 }, last4: '4242' },
        failedGift: { amount: 70, give: { tithe: 70 } },
      },
      recent: [{ ...row, amount: 50, funds: ['Tithe'] }],
      rhythm: { gifts: 1, monthsGiven: 1, monthsSoFar: 3, usualGift: 50 },
    })
  })

  it("lists each recent gift's funds in item order", async () => {
    expect.hasAssertions()

    const statements: string[] = []
    const db = createDriverDb((sql) => {
      statements.push(sql)
      return Promise.resolve({ rowCount: 0, rows: [] })
    })

    await db.run(recentTransactions({ donor, endExclusive: undefined, start: undefined }))

    expect(statements[0]).toContain(
      'coalesce(array_agg("funds"."name" order by "transaction_items"."id") filter (where "funds"."name" is not null), \'{}\')',
    )
    expect(statements[0]).toMatch(
      /group by "transactions"\."id" order by "transactions"\."created_at" desc limit \$\d+$/u,
    )
  })

  it("reads the items of the donor's newest transaction among the given statuses", async () => {
    expect.hasAssertions()

    const statements: { params: unknown[]; sql: string }[] = []
    const db = createDriverDb((sql, params) => {
      statements.push({ params, sql })
      return Promise.resolve({ rowCount: 0, rows: [] })
    })

    await db.run(newestGiftItems(donor, ['success']))

    expect(statements).toStrictEqual([
      {
        params: [2, 'success', 'user', 1],
        sql: [
          'select "transaction_items"."amount", "transactions"."created_at", "funds"."name",',
          '"transactions"."amount", "transactions"."status" from "transaction_items"',
          'inner join "transactions" on "transaction_items"."transaction_id" = "transactions"."id"',
          'inner join "funds" on "transaction_items"."fund_id" = "funds"."id"',
          'where "transaction_items"."transaction_id" in (select "id" from "transactions"',
          'where ("transactions"."user_id" = $1 and "transactions"."status" in ($2)',
          'and "transactions"."created_as" = $3) order by "transactions"."created_at" desc limit $4)',
          'order by "transaction_items"."id" asc',
        ].join(' '),
      },
    ])
  })

  it('never carries the card token', async () => {
    expect.hasAssertions()

    const overview = okValue(
      await loadOverview({ db: overviewDb() }, { donor, now: MARCH_1, year: 2025 }),
    )

    expect(JSON.stringify(overview)).not.toContain(savedCard.token)
  })

  it("reads the signed-in donor's own journey, whatever the client sends", async () => {
    expect.hasAssertions()

    const db = overviewDb()
    expectTypeOf<OverviewInput>().toEqualTypeOf<{ year: 'all' | number }>()
    type Wire = Awaited<ReturnType<typeof getOverview>>
    expectTypeOf<Wire['hero']['kind']>().toEqualTypeOf<'all' | 'year'>()
    expectTypeOf<Extract<Wire['hero'], { kind: 'all' }>>().toEqualTypeOf<{
      kind: 'all'
      since: Date | null
      total: number
      years: { total: number; year: number }[]
    }>()
    expectTypeOf<Extract<Wire['hero'], { kind: 'year' }>>().toEqualTypeOf<{
      kind: 'year'
      lastYear: number[] | null
      lastYearSameDay: number | null
      thisYear: number[]
      today: number | null
      total: number
      year: number
    }>()
    expectTypeOf<Omit<Wire, 'hero'>>().toEqualTypeOf<{
      funds: { amount: number; fundName: string; share: number }[]
      giveAgain: Repeatable | null
      notices: {
        expiringCard: {
          cardType: string
          expires: { month: number; year: number }
          last4: string
        } | null
        failedGift: Repeatable | null
      }
      recent: {
        amount: number
        createdAt: Date
        funds: string[]
        id: string
        status: Row['status']
      }[]
      rhythm: {
        gifts: number
        largest: { amount: number; date: Date; funds: string[] } | null
        months: { month: number; total: number | null }[]
        monthsGiven: number
        monthsSoFar: number
        usualGift: number
      } | null
    }>()

    const overview = await getOverviewAction({
      context: testContext(migrating, { db }),
      data: { journey: 'start_fresh', year: 'all' },
    })

    expect(overview.recent).toStrictEqual([{ ...row, amount: 50, funds: ['Tithe'] }])
    expect(db.calls[0]?.args).toStrictEqual([
      { donor: { id: 2, journey: 'migrate' }, endExclusive: undefined, start: undefined },
    ])
  })

  it("answers real amounts to a donor in privacy mode, since hiding them is the screen's job", async () => {
    expect.hasAssertions()

    const overview = await getOverviewAction({
      context: testContext(MEMBER, { db: overviewDb() }, { privacyMode: true, userId: 2 }),
      data: { year: 'all' },
    })

    expect(overview.hero.total).toBe(50)
    expect(overview.funds).toStrictEqual([{ amount: 50, fundName: 'Tithe', share: 1 }])
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
    const db = overviewDb().on(recentTransactions, () => {
      throw new Error('relation "transaction_items" does not exist')
    })

    await expect(
      getOverviewAction({ context: testContext(MEMBER, { db, logger }), data: { year: 'all' } }),
    ).rejects.toThrow(new Error('Internal Server Error'))
    expect(events).toMatchObject([
      { event: 'history.overview.failed', op: overviewQueries.join(' + ') },
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

  it.each([1.5, 1e21, -1e21, Number.MAX_SAFE_INTEGER + 1])(
    'refuses page %d, which is not a safe integer, without reading',
    async (page) => {
      expect.hasAssertions()

      const { events, logger } = recordingLogger()
      const db = pageDb()

      await expect(
        getTransactionsAction({ context: testContext(MEMBER, { db, logger }), data: { page } }),
      ).rejects.toThrow(new Error('Invalid input'))
      expect(events).toMatchObject([{ event: 'history.transactions.validation_failed' }])
      expect(db.calls).toStrictEqual([])
    },
  )

  it('reads the last safe page', async () => {
    expect.hasAssertions()

    const db = pageDb()

    await getTransactionsAction({
      context: testContext(MEMBER, { db }),
      data: { page: Number.MAX_SAFE_INTEGER },
    })
    expect(db.calls[1]?.args).toStrictEqual([
      donor,
      { limit: 20, offset: 20 * (Number.MAX_SAFE_INTEGER - 1) },
    ])
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
