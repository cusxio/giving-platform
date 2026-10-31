import { describe, expect, expectTypeOf, it } from 'vitest'

import type {
  BusinessErrorResponse,
  ServerErrorResponse,
  SuccessResponse,
  ValidationErrorResponse,
} from '#/core/wire'
import { findUserByEmail, upsertGuestUser } from '#/modules/account/server'
import { InfraError } from '#/server/infra-error'
import type { FakeDb } from '#/server/testing/fake-db'
import { createFakeDb } from '#/server/testing/fake-db'
import { recordingLogger } from '#/server/testing/recording-logger'
import { errValue, okValue } from '#/server/testing/result'
import { MEMBER, testContext } from '#/server/testing/test-context'

import type { startContribution } from './payments.functions'
import { findSavedCard } from './saved-cards.repository.server'
import { createPendingContribution, startContributionAction } from './start-contribution.server'
import {
  findFundsByName,
  insertPendingTransaction,
  insertTransactionItems,
} from './transactions.repository.server'

const WARN = 40
const ERROR = 50

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
    .on(findSavedCard, (userId, token) =>
      userId === MEMBER.id && token === 'tok_own' ? { id: 7 } : null,
    )
}

const input = (overrides: Record<string, unknown> = {}) => ({
  contributions: { future: 0, mission: 2.25, offering: 10, tithe: 0 },
  email: '  Donor@Give.Test ',
  firstName: ' Ada ',
  lastName: 'Lovelace ',
  ...overrides,
})

async function start(fake: FakeDb, user: typeof MEMBER | null, data: unknown) {
  const { events, logger } = recordingLogger()
  const response = await startContributionAction({
    context: testContext(user, { db: fake, logger }),
    data,
  })
  return { calls: fake.calls.map((c) => c.name), events, outcomes: fake.transactions, response }
}

function redirectParams(response: Awaited<ReturnType<typeof startContributionAction>>) {
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

    expectTypeOf<Awaited<ReturnType<typeof startContribution>>>().toEqualTypeOf<
      | BusinessErrorResponse<
          'EMAIL_EXISTS' | 'INVALID_REQUEST' | 'PAYMENT_METHOD_UNAVAILABLE' | 'USER_MISMATCH'
        >
      | ServerErrorResponse
      | SuccessResponse<{ redirectURL: string }>
      | ValidationErrorResponse
    >()
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
    expect(result.events).toMatchObject([
      {
        email: 'donor@give.test',
        event: 'giving.start_contribution.attempt',
        funds: ['mission', 'offering'],
        msg: 'Creating pending transaction',
        total_cents: 1225,
      },
      {
        event: 'giving.start_contribution.redirected',
        msg: 'Success, redirecting to eGHL',
        transaction_id: 'txn_pending_000000001',
      },
    ])
  })

  it('reads fund amounts sent as form strings', async () => {
    expect.hasAssertions()

    const result = await start(
      contributionDb(null),
      null,
      input({ contributions: { future: '0', mission: '2.25', offering: '10', tithe: '0' } }),
    )

    expect(redirectParams(result.response)).toMatchObject(successFor('donor@give.test'))
  })

  it('accepts the most one fund may receive', async () => {
    expect.hasAssertions()

    const result = await start(
      contributionDb(null),
      null,
      input({ contributions: { future: 0, mission: 0, offering: '5000000', tithe: 0 } }),
    )

    expect(redirectParams(result.response)).toMatchObject({ Amount: '5000000.00' })
  })

  it('accepts names as long as the account columns, after trimming', async () => {
    expect.hasAssertions()

    const [first, last] = ['f'.repeat(32), 'l'.repeat(32)]
    const fake = contributionDb(null)
    const result = await start(fake, null, input({ firstName: ` ${first} `, lastName: last }))

    expect(redirectParams(result.response)).toMatchObject({ CustName: `${first} ${last}` })
    expect(fake.calls[1]).toStrictEqual({
      args: [{ email: 'donor@give.test', firstName: first, lastName: last }],
      name: 'account.upsertGuestUser',
    })
  })

  it('upserts a guest who already gave with the email', async () => {
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
      email: 'donor@give.test',
      event: 'giving.start_contribution.blocked',
      level: WARN,
      msg: 'Guest used existing account email',
      reason: 'email_exists',
    })
  })

  it('refuses an email registered after the lookup saw a guest, and rolls back', async () => {
    expect.hasAssertions()

    const fake = contributionDb(userRow(41, 'donor@give.test', 'guest')).on(
      upsertGuestUser,
      () => null,
    )
    const result = await start(fake, null, input())

    expect(result.response).toStrictEqual({
      error: { code: 'EMAIL_EXISTS' },
      type: 'BUSINESS_ERROR',
    })
    expect(result.calls).toStrictEqual(['account.findUserByEmail', 'account.upsertGuestUser'])
    expect(result.outcomes).toStrictEqual(['rollback'])
    expect(result.events.at(-1)).toMatchObject({
      email: 'donor@give.test',
      event: 'giving.start_contribution.blocked',
      level: WARN,
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
    expect(result.events).toMatchObject([
      {
        email: 'donor@give.test',
        event: 'giving.start_contribution.blocked',
        level: WARN,
        msg: 'Saved card used without a session',
        reason: 'saved_card_without_user',
      },
    ])
  })
})

describe('starting a contribution signed in', () => {
  it('gives as the session user with their own email, without touching the account', async () => {
    expect.hasAssertions()

    const fake = contributionDb(userRow(2, 'donor@give.test', 'active'))
    const result = await start(fake, MEMBER, input())

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

    const result = await start(contributionDb(null), MEMBER, input())

    expect(redirectParams(result.response)).toMatchObject(successFor('donor@give.test'))
    expect(result.calls).toStrictEqual(SUCCESS_CALLS)
  })

  it("refuses another account's email, guest or not, and rolls back", async () => {
    expect.hasAssertions()

    for (const status of ['active', 'guest'] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one case per status, in order
      const result = await start(
        contributionDb(userRow(9, 'donor@give.test', status)),
        MEMBER,
        input(),
      )

      expect(result.response).toStrictEqual({
        error: { code: 'USER_MISMATCH' },
        type: 'BUSINESS_ERROR',
      })
      expect(result.calls).toStrictEqual(['account.findUserByEmail'])
      expect(result.outcomes).toStrictEqual(['rollback'])
      expect(result.events.at(-1)).toMatchObject({
        email: 'donor@give.test',
        event: 'giving.start_contribution.blocked',
        level: WARN,
        msg: 'Email mismatch',
        reason: 'user_mismatch',
      })
    }
  })

  it('charges a saved card the user owns, signing its token into the URL', async () => {
    expect.hasAssertions()

    const result = await start(contributionDb(null), MEMBER, input({ token: 'tok_own' }))

    expect(redirectParams(result.response)).toMatchObject(successFor('donor@give.test', 'tok_own'))
    expect(result.calls).toStrictEqual(['payments.findSavedCard', ...SUCCESS_CALLS])
  })

  it('refuses a saved card the user does not own, before the transaction', async () => {
    expect.hasAssertions()

    const result = await start(contributionDb(null), MEMBER, input({ token: 'tok_other' }))

    expect(result.response).toStrictEqual({
      error: { code: 'PAYMENT_METHOD_UNAVAILABLE' },
      type: 'BUSINESS_ERROR',
    })
    expect(result.calls).toStrictEqual(['payments.findSavedCard'])
    expect(result.outcomes).toStrictEqual([])
    expect(result.events).toMatchObject([
      {
        event: 'giving.start_contribution.blocked',
        level: WARN,
        msg: 'Saved card not found for user',
        reason: 'saved_card_not_found',
        user_id: MEMBER.id,
      },
    ])
  })

  it('is a server error when the saved card lookup fails', async () => {
    expect.hasAssertions()

    const result = await start(
      contributionDb(null).on(findSavedCard, fail),
      MEMBER,
      input({ token: 'tok_own' }),
    )

    expect(result.response).toStrictEqual({ type: 'SERVER_ERROR' })
    expect(result.outcomes).toStrictEqual([])
    expect(result.events).toMatchObject([
      {
        'error.type': 'Error',
        event: 'giving.start_contribution.failed',
        level: ERROR,
        op: findSavedCard.queryName,
      },
    ])
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
    expect(result.events).toMatchObject([
      { event: 'giving.start_contribution.validation_failed', level: WARN },
    ])
  })

  it.each([
    { case: 'a blank first name', data: input({ firstName: '   ' }) },
    { case: 'a first name that is a number', data: input({ firstName: 123 }) },
    { case: 'a first name past 32 characters', data: input({ firstName: 'f'.repeat(33) }) },
    { case: 'a last name past 32 characters', data: input({ lastName: 'l'.repeat(33) }) },
    ...[5_000_000.01, 9e15, '1e308'].map((offering) => ({
      case: `RM ${offering} to one fund`,
      data: input({ contributions: { future: 0, mission: 0, offering, tithe: 0 } }),
    })),
    {
      case: 'an email past 254 characters',
      data: input({
        email: `${'d'.repeat(64)}@${'x'.repeat(60)}.${'y'.repeat(60)}.${'z'.repeat(60)}.www.test`,
      }),
    },
    { case: 'a saved card token that is a number', data: input({ token: 7 }) },
    { case: 'a body that is not an object', data: 'nope' },
    { case: 'no body', data: undefined },
  ])('is a validation error for $case, before any query', async ({ data }) => {
    expect.hasAssertions()

    const result = await start(contributionDb(null), null, data)

    expect(result.response).toMatchObject({ type: 'VALIDATION_ERROR' })
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
    expect(result.events).toMatchObject([
      {
        email: 'donor@give.test',
        event: 'giving.start_contribution.invalid_request',
        level: WARN,
        msg: 'Request contained 0 items',
      },
    ])
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
      'error.type': 'no-row',
      event: 'giving.start_contribution.failed',
      level: ERROR,
      msg: 'payments.findFundsByName returned no row for Future',
      op: 'payments.findFundsByName',
    })
    expect(result.events.at(-1)).not.toHaveProperty('err')
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
      'error.type': 'Error',
      err: { message: 'connection terminated', type: 'Error' },
      event: 'giving.start_contribution.failed',
      level: ERROR,
      op: insertTransactionItems.queryName,
    })
  })

  it('logs a failed statement without the parameters it was given', async () => {
    expect.hasAssertions()

    const result = await start(contributionDb(null).on(findUserByEmail, fail), null, input())
    const failure = result.events.at(-1)

    expect(result.response).toStrictEqual({ type: 'SERVER_ERROR' })
    expect(result.outcomes).toStrictEqual(['rollback'])
    expect(failure).toMatchObject({
      event: 'giving.start_contribution.failed',
      op: findUserByEmail.queryName,
    })
    expect(JSON.stringify(failure)).not.toContain('donor@give.test')
  })
})

describe('the pending contribution transaction', () => {
  const items = [{ amountInCents: 500, fund: 'offering' as const }]
  const donor = { email: 'donor@give.test', firstName: 'Ada', lastName: 'Lovelace' }

  it.each([
    {
      case: 'the email lookup fails',
      fake: () => contributionDb(null).on(findUserByEmail, fail),
      op: findUserByEmail.queryName,
      reason: 'failed',
    },
    {
      case: 'creating the guest fails',
      fake: () => contributionDb(null).on(upsertGuestUser, fail),
      op: upsertGuestUser.queryName,
      reason: 'failed',
    },
    {
      case: 'inserting the transaction returns no row',
      fake: () => contributionDb(null).on(insertPendingTransaction, () => null),
      op: insertPendingTransaction.queryName,
      reason: 'no-row',
    },
  ])('rolls back with an InfraError when $case', async ({ fake, op, reason }) => {
    expect.hasAssertions()

    const db = fake()
    const error = errValue(await createPendingContribution({ db }, items, donor, null))

    expect(error).toBeInstanceOf(InfraError)
    expect(error).toMatchObject({ op, reason })
    expect(db.transactions).toStrictEqual(['rollback'])
  })

  it('names the customer for the gateway', async () => {
    expect.hasAssertions()

    const db = contributionDb(null)

    expect(okValue(await createPendingContribution({ db }, items, donor, MEMBER))).toStrictEqual({
      customerName: 'Ada Lovelace',
      transactionId: 'txn_pending_000000001',
    })
    expect(db.transactions).toStrictEqual(['commit'])
  })
})
