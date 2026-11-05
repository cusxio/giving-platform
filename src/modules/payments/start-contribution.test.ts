import { pino } from 'pino'
import { describe, expect, it } from 'vitest'

import { findUserByEmail, upsertGuestUser } from '#/modules/account/server'
import type { Db } from '#/server/db.server'
import type { FakeDb } from '#/server/testing/fake-db'
import { createFakeDb } from '#/server/testing/fake-db'
import { testDeps } from '#/server/testing/test-deps'

import { findSavedCard } from './saved-cards.repository.server'
import { beginContribution, createPendingContribution } from './start-contribution.server'
import {
  findFundsByName,
  insertPendingTransaction,
  insertTransactionItems,
} from './transactions.repository.server'

interface LogLine {
  readonly err?: { readonly message: string; readonly type: string }
  readonly error_type?: string
  readonly event?: string
  readonly level: number
  readonly reason?: string
}

function recordingLogger() {
  const events: LogLine[] = []
  const logger = pino(
    { level: 'debug' },
    {
      write: (line: string) => {
        events.push(JSON.parse(line) as LogLine)
      },
    },
  )
  return { events, logger }
}

/** Notes whether each transaction committed or rolled back, which the fake does not model. */
function recordingTransactions(db: FakeDb) {
  const outcomes: string[] = []
  const wrapped: Db = {
    ...db,
    transaction: (work) =>
      db.transaction(work).then(
        (value) => {
          outcomes.push('commit')
          return value
        },
        (error: unknown) => {
          outcomes.push('rollback')
          throw error
        },
      ),
  }
  return { db: wrapped, outcomes }
}

function fail(): never {
  throw new Error('connection terminated')
}

const at = new Date('2026-10-01T10:00:00Z')

const userRow = (id: number, email: string, status: 'active' | 'guest') => ({
  createdAt: at,
  email,
  emailVerifiedAt: status === 'guest' ? null : at,
  firstName: 'Old',
  id,
  journey: null,
  lastName: 'Name',
  role: 'user' as const,
  status,
  updatedAt: at,
})

const FUNDS = [
  {
    createdAt: at,
    description: null,
    id: 'fund_general',
    name: 'Offering',
    primary: true,
    updatedAt: at,
  },
  {
    createdAt: at,
    description: null,
    id: 'fund_mission',
    name: 'Mission',
    primary: false,
    updatedAt: at,
  },
]

const pendingRow = (amount: number, createdAs: 'guest' | 'user', userId: number) => ({
  amount,
  createdAs,
  createdAt: at,
  id: 'txn_pending_000000001',
  status: 'pending' as const,
  updatedAt: at,
  userId,
})

/** Answers every query of a successful contribution. `owner` is who already has the email. */
function contributionDb(owner: ReturnType<typeof userRow> | null) {
  return createFakeDb()
    .on(findUserByEmail, () => owner)
    .on(upsertGuestUser, (input) => ({ ...userRow(41, input.email, 'guest'), ...input }))
    .on(findFundsByName, (names) => FUNDS.filter((f) => names.includes(f.name)))
    .on(insertPendingTransaction, (input) =>
      pendingRow(input.amount, input.createdAs, input.userId),
    )
    .on(insertTransactionItems, () => {})
    .on(findSavedCard, (userId, token) => (userId === 2 && token === 'tok_own' ? { id: 7 } : null))
}

const input = (overrides: Partial<Parameters<typeof beginContribution>[2]> = {}) => ({
  contributions: { future: 0, mission: 2.25, offering: 10, tithe: 0 },
  email: '  Donor@Give.Test ',
  firstName: ' Ada ',
  lastName: 'Lovelace ',
  ...overrides,
})

const member = { id: 2 }

async function start(
  fake: FakeDb,
  sessionUser: null | { id: number },
  data: ReturnType<typeof input>,
) {
  const { db, outcomes } = recordingTransactions(fake)
  const { events, logger } = recordingLogger()
  const response = await beginContribution(testDeps({ db, logger }), sessionUser, data)
  return { calls: fake.calls.map((c) => c.name), events, outcomes, response }
}

function redirectParams(response: Awaited<ReturnType<typeof beginContribution>>) {
  if (response.type !== 'SUCCESS') {
    throw new Error(`expected SUCCESS, got ${response.type}`)
  }
  return Object.fromEntries(new URL(response.value.redirectURL).searchParams)
}

const successFor = (email: string, token?: string) => ({
  Amount: '12.25',
  CustEmail: email,
  CustName: 'Ada Lovelace',
  PaymentID: 'txn_pending_000000001',
  ...(token !== undefined && { Token: token, TokenType: 'OCP' }),
})

const SUCCESS_CALLS = [
  'account.findUserByEmail',
  'payments.findFundsByName',
  'payments.insertPendingTransaction',
  'payments.insertTransactionItems',
]

describe('starting a contribution as a guest', () => {
  it('creates the guest and a pending transaction, then redirects to the gateway', async () => {
    expect.hasAssertions()

    const fake = contributionDb(null)
    const result = await start(fake, null, input())

    expect(redirectParams(result.response)).toMatchObject(successFor('donor@give.test'))
    expect(result.outcomes).toStrictEqual(['commit'])
    expect(fake.calls).toStrictEqual([
      { args: ['donor@give.test'], name: 'account.findUserByEmail' },
      {
        args: [{ email: 'donor@give.test', firstName: 'Ada', lastName: 'Lovelace' }],
        name: 'account.upsertGuestUser',
      },
      { args: [['Mission', 'Offering']], name: 'payments.findFundsByName' },
      {
        args: [{ amount: 1225, createdAs: 'guest', userId: 41 }],
        name: 'payments.insertPendingTransaction',
      },
      {
        args: [
          [
            { amount: 225, fundId: 'fund_mission', transactionId: 'txn_pending_000000001' },
            { amount: 1000, fundId: 'fund_general', transactionId: 'txn_pending_000000001' },
          ],
        ],
        name: 'payments.insertTransactionItems',
      },
    ])
    expect(result.events.map((e) => e.event)).toStrictEqual([
      'giving.start_contribution.attempt',
      'giving.start_contribution.redirected',
    ])
  })

  it('renames a guest who already gave with the email', async () => {
    expect.hasAssertions()

    const result = await start(
      contributionDb(userRow(41, 'donor@give.test', 'guest')),
      null,
      input(),
    )

    expect(redirectParams(result.response)).toMatchObject(successFor('donor@give.test'))
    expect(result.calls).toStrictEqual([
      'account.findUserByEmail',
      'account.upsertGuestUser',
      ...SUCCESS_CALLS.slice(1),
    ])
    expect(result.outcomes).toStrictEqual(['commit'])
  })

  it("refuses a registered account's email and rolls back", async () => {
    expect.hasAssertions()

    const result = await start(
      contributionDb(userRow(5, 'donor@give.test', 'active')),
      null,
      input(),
    )

    expect(result.response).toStrictEqual({
      error: { code: 'EMAIL_EXISTS' },
      type: 'BUSINESS_ERROR',
    })
    expect(result.calls).toStrictEqual(['account.findUserByEmail'])
    expect(result.outcomes).toStrictEqual(['rollback'])
    expect(result.events.at(-1)).toMatchObject({
      event: 'giving.start_contribution.blocked',
      level: 40,
      reason: 'email_exists',
    })
  })

  it('may not charge a saved card, before any query', async () => {
    expect.hasAssertions()

    const result = await start(contributionDb(null), null, input({ token: 'tok_own' }))

    expect(result.response).toStrictEqual({
      error: { code: 'PAYMENT_METHOD_UNAVAILABLE' },
      type: 'BUSINESS_ERROR',
    })
    expect(result.calls).toStrictEqual([])
    expect(result.events.at(-1)).toMatchObject({ reason: 'saved_card_without_user' })
  })
})

describe('starting a contribution signed in', () => {
  it('gives as the session user with their own email, without touching the account', async () => {
    expect.hasAssertions()

    const fake = contributionDb(userRow(2, 'donor@give.test', 'active'))
    const result = await start(fake, member, input())

    expect(redirectParams(result.response)).toMatchObject(successFor('donor@give.test'))
    expect(result.calls).toStrictEqual(SUCCESS_CALLS)
    expect(fake.calls[2]).toStrictEqual({
      args: [{ amount: 1225, createdAs: 'user', userId: 2 }],
      name: 'payments.insertPendingTransaction',
    })
    expect(result.outcomes).toStrictEqual(['commit'])
  })

  it('gives as the session user with an email nobody has', async () => {
    expect.hasAssertions()

    const result = await start(contributionDb(null), member, input())

    expect(redirectParams(result.response)).toMatchObject(successFor('donor@give.test'))
    expect(result.calls).toStrictEqual(SUCCESS_CALLS)
  })

  it("refuses another account's email, guest or not, and rolls back", async () => {
    expect.hasAssertions()

    for (const status of ['active', 'guest'] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one case per status, in order
      const result = await start(
        contributionDb(userRow(9, 'donor@give.test', status)),
        member,
        input(),
      )

      expect(result.response).toStrictEqual({
        error: { code: 'USER_MISMATCH' },
        type: 'BUSINESS_ERROR',
      })
      expect(result.calls).toStrictEqual(['account.findUserByEmail'])
      expect(result.outcomes).toStrictEqual(['rollback'])
    }
  })

  it('charges a saved card the user owns, signing its token into the URL', async () => {
    expect.hasAssertions()

    const result = await start(contributionDb(null), member, input({ token: 'tok_own' }))

    expect(redirectParams(result.response)).toMatchObject(successFor('donor@give.test', 'tok_own'))
    expect(result.calls).toStrictEqual(['payments.findSavedCard', ...SUCCESS_CALLS])
  })

  it('refuses a saved card the user does not own, before the transaction', async () => {
    expect.hasAssertions()

    const result = await start(contributionDb(null), member, input({ token: 'tok_other' }))

    expect(result.response).toStrictEqual({
      error: { code: 'PAYMENT_METHOD_UNAVAILABLE' },
      type: 'BUSINESS_ERROR',
    })
    expect(result.calls).toStrictEqual(['payments.findSavedCard'])
    expect(result.outcomes).toStrictEqual([])
    expect(result.events.at(-1)).toMatchObject({ reason: 'saved_card_not_found' })
  })

  it('is a server error when the saved card lookup fails', async () => {
    expect.hasAssertions()

    const result = await start(
      contributionDb(null).on(findSavedCard, fail),
      member,
      input({ token: 'tok_own' }),
    )

    expect(result.response).toStrictEqual({ type: 'SERVER_ERROR' })
    expect(result.outcomes).toStrictEqual([])
    expect(result.events.at(-1)).toMatchObject({
      error_type: 'DBQueryError',
      event: 'giving.start_contribution.failed',
      level: 50,
    })
  })
})

describe('a contribution that is not recorded', () => {
  it('is a validation error for a bad email, before any query', async () => {
    expect.hasAssertions()

    const result = await start(contributionDb(null), null, input({ email: 'not-an-email' }))

    expect(result.response).toStrictEqual({
      errors: [{ message: 'must match format "email"', path: '/email' }],
      type: 'VALIDATION_ERROR',
    })
    expect(result.calls).toStrictEqual([])
  })

  it('is an invalid request when every fund gets nothing', async () => {
    expect.hasAssertions()

    const result = await start(
      contributionDb(null),
      null,
      input({ contributions: { future: 0, mission: 0, offering: 0, tithe: 0 } }),
    )

    expect(result.response).toStrictEqual({
      error: { code: 'INVALID_REQUEST' },
      type: 'BUSINESS_ERROR',
    })
    expect(result.calls).toStrictEqual([])
  })

  it('rolls back when a fund is missing from the table, inserting no items', async () => {
    expect.hasAssertions()

    const result = await start(
      contributionDb(null),
      null,
      input({ contributions: { future: 3, mission: 0, offering: 1, tithe: 0 } }),
    )

    expect(result.response).toStrictEqual({ type: 'SERVER_ERROR' })
    expect(result.calls).toStrictEqual([
      'account.findUserByEmail',
      'account.upsertGuestUser',
      'payments.findFundsByName',
      'payments.insertPendingTransaction',
    ])
    expect(result.outcomes).toStrictEqual(['rollback'])
    expect(result.events.at(-1)).toMatchObject({
      err: { message: 'Invalid fund name: Future', type: 'Error' },
      error_type: 'TransactionRollbackError',
      event: 'giving.start_contribution.failed',
      level: 50,
    })
  })

  it('rolls back when a statement fails mid-transaction', async () => {
    expect.hasAssertions()

    const result = await start(contributionDb(null).on(insertTransactionItems, fail), null, input())

    expect(result.response).toStrictEqual({ type: 'SERVER_ERROR' })
    expect(result.calls).toStrictEqual([
      'account.findUserByEmail',
      'account.upsertGuestUser',
      ...SUCCESS_CALLS.slice(1),
    ])
    expect(result.outcomes).toStrictEqual(['rollback'])
    expect(result.events.at(-1)).toMatchObject({
      err: { message: 'connection terminated' },
      error_type: 'TransactionRollbackError',
    })
  })
})

describe('the pending contribution transaction', () => {
  const items = [{ amountInCents: 500, fund: 'offering' as const }]
  const donor = { email: 'donor@give.test', firstName: 'Ada', lastName: 'Lovelace' }

  it.each([
    {
      case: 'the email lookup fails',
      fake: () => contributionDb(null).on(findUserByEmail, fail),
      message: 'Error finding user by email',
    },
    {
      case: 'creating the guest fails',
      fake: () => contributionDb(null).on(upsertGuestUser, fail),
      message: 'Error creating user',
    },
    {
      case: 'creating the guest returns no row',
      fake: () => contributionDb(null).on(upsertGuestUser, () => null),
      message: 'User creation returned no result',
    },
    {
      case: 'inserting the transaction returns no row',
      fake: () => contributionDb(null).on(insertPendingTransaction, () => null),
      message: 'Transaction creation returned no result',
    },
  ])('rolls back with a TransactionRollbackError when $case', async ({ fake, message }) => {
    expect.hasAssertions()

    const { db, outcomes } = recordingTransactions(fake())
    const result = await createPendingContribution({ db }, items, donor, null)

    expect(result).toMatchObject({
      error: {
        error: { message, name: 'TransactionRollbackError' },
        type: 'TransactionRollbackError',
      },
      ok: false,
    })
    expect(outcomes).toStrictEqual(['rollback'])
  })

  it('keeps the DB error as the cause of a failed lookup', async () => {
    expect.hasAssertions()

    const result = await createPendingContribution(
      { db: contributionDb(null).on(findUserByEmail, fail) },
      items,
      donor,
      null,
    )

    expect(result).toMatchObject({
      error: { error: { cause: { type: 'DBQueryError' } } },
      ok: false,
    })
  })

  it('names the customer for the gateway', async () => {
    expect.hasAssertions()

    await expect(
      createPendingContribution({ db: contributionDb(null) }, items, donor, member),
    ).resolves.toStrictEqual({
      ok: true,
      value: { customerName: 'Ada Lovelace', transactionId: 'txn_pending_000000001' },
    })
  })
})
