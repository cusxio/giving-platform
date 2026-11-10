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
  insertPendingGuestTransaction,
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

/** eGHL takes the transaction id as its 20-character PaymentID. */
const TRANSACTION_ID = /^[A-Za-z0-9]{20}$/u

const READ = ['account.findUserByEmail', 'payments.findFundsByName']
const GUEST_WRITE = [
  'account.upsertGuestUser',
  'payments.insertPendingGuestTransaction',
  'payments.insertTransactionItems',
]
const USER_WRITE = ['payments.insertPendingTransaction', 'payments.insertTransactionItems']
const ITEMS = [
  { amount: 225, fundId: 'fund_mission' },
  { amount: 1000, fundId: 'fund_general' },
]

/** Answers every query of a successful contribution. `owner` is who already has the email. */
function contributionDb(owner: ReturnType<typeof userRow> | null) {
  return createFakeDb()
    .on(findUserByEmail, () => owner)
    .on(upsertGuestUser, (input) => ({ ...userRow(41, input.email, 'guest'), ...input }))
    .on(findFundsByName, (names) => FUNDS.filter((f) => names.includes(f.name)))
    .on(insertPendingTransaction, (input) => ({
      ...input,
      createdAs: 'user',
      createdAt: at,
      status: 'pending',
      updatedAt: at,
    }))
    .on(insertPendingGuestTransaction, ({ id }) => ({ id }))
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
  return { calls: fake.calls.map((c) => c.name), events, response, trips: fake.roundTrips }
}

function insertedId(fake: FakeDb): string {
  const inserts = new Set([
    insertPendingTransaction.queryName,
    insertPendingGuestTransaction.queryName,
  ])
  const input: unknown = fake.calls.find((call) => inserts.has(call.name))?.args[0]
  if (typeof input !== 'object' || input === null || !('id' in input)) {
    throw new Error('no transaction was inserted')
  }
  return String(input.id)
}

function redirectParams(response: Awaited<ReturnType<typeof startContributionAction>>) {
  if (response.type !== 'SUCCESS') {
    throw new Error(`expected SUCCESS, got ${response.type}`)
  }
  return Object.fromEntries(new URL(response.value.redirectURL).searchParams)
}

const successFor = (email: string, transactionId: string, token?: string) => ({
  Amount: '12.25',
  CustEmail: email,
  CustName: 'Ada Lovelace',
  PaymentID: transactionId,
  ...(token !== undefined && { Token: token, TokenType: 'OCP' }),
})

describe('starting a contribution as a guest', () => {
  it('creates the guest, the transaction and its items in one batch, then redirects', async () => {
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
    const id = insertedId(fake)

    expect(id).toMatch(TRANSACTION_ID)
    expect(redirectParams(result.response)).toMatchObject(successFor('donor@give.test', id))
    expect(result.trips).toStrictEqual([READ, GUEST_WRITE])
    expect(fake.calls).toStrictEqual([
      { args: ['donor@give.test'], name: 'account.findUserByEmail' },
      { args: [['Mission', 'Offering']], name: 'payments.findFundsByName' },
      {
        args: [{ email: 'donor@give.test', firstName: 'Ada', lastName: 'Lovelace' }],
        name: 'account.upsertGuestUser',
      },
      {
        args: [{ amount: 1225, email: 'donor@give.test', id }],
        name: 'payments.insertPendingGuestTransaction',
      },
      { args: [id, ITEMS], name: 'payments.insertTransactionItems' },
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
        transaction_id: id,
      },
    ])
  })

  it('reads fund amounts sent as form strings', async () => {
    expect.hasAssertions()

    const fake = contributionDb(null)
    const result = await start(
      fake,
      null,
      input({ contributions: { future: '0', mission: '2.25', offering: '10', tithe: '0' } }),
    )

    expect(redirectParams(result.response)).toMatchObject(
      successFor('donor@give.test', insertedId(fake)),
    )
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
    expect(fake.calls[2]).toStrictEqual({
      args: [{ email: 'donor@give.test', firstName: first, lastName: last }],
      name: 'account.upsertGuestUser',
    })
  })

  it('upserts a guest who already gave with the email', async () => {
    expect.hasAssertions()

    const fake = contributionDb(userRow(41, 'donor@give.test', 'guest'))
    const result = await start(fake, null, input())

    expect(redirectParams(result.response)).toMatchObject(
      successFor('donor@give.test', insertedId(fake)),
    )
    expect(result.trips).toStrictEqual([READ, GUEST_WRITE])
  })

  it("refuses a registered account's email before writing anything", async () => {
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
    expect(result.trips).toStrictEqual([READ])
    expect(result.events.at(-1)).toMatchObject({
      email: 'donor@give.test',
      event: 'giving.start_contribution.blocked',
      level: WARN,
      msg: 'Guest used existing account email',
      reason: 'email_exists',
    })
  })

  it('refuses an email registered after the lookup, whose batch then writes nothing', async () => {
    expect.hasAssertions()

    const fake = contributionDb(userRow(41, 'donor@give.test', 'guest'))
      .on(upsertGuestUser, () => null)
      .on(insertPendingGuestTransaction, () => null)
    const result = await start(fake, null, input())

    expect(result.response).toStrictEqual({
      error: { code: 'EMAIL_EXISTS' },
      type: 'BUSINESS_ERROR',
    })
    expect(result.trips).toStrictEqual([READ, GUEST_WRITE])
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
    const id = insertedId(fake)

    expect(redirectParams(result.response)).toMatchObject(successFor('donor@give.test', id))
    expect(result.trips).toStrictEqual([READ, USER_WRITE])
    expect(fake.calls.slice(2)).toStrictEqual([
      { args: [{ amount: 1225, id, userId: 2 }], name: 'payments.insertPendingTransaction' },
      { args: [id, ITEMS], name: 'payments.insertTransactionItems' },
    ])
  })

  it('gives as the session user with an email nobody has', async () => {
    expect.hasAssertions()

    const fake = contributionDb(null)
    const result = await start(fake, MEMBER, input())

    expect(redirectParams(result.response)).toMatchObject(
      successFor('donor@give.test', insertedId(fake)),
    )
    expect(result.calls).toStrictEqual([...READ, ...USER_WRITE])
  })

  it("refuses another account's email, guest or not, before writing anything", async () => {
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
      expect(result.trips).toStrictEqual([READ])
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

    const fake = contributionDb(null)
    const result = await start(fake, MEMBER, input({ token: 'tok_own' }))

    expect(redirectParams(result.response)).toMatchObject(
      successFor('donor@give.test', insertedId(fake), 'tok_own'),
    )
    expect(result.calls).toStrictEqual(['payments.findSavedCard', ...READ, ...USER_WRITE])
  })

  it('refuses a saved card the user does not own, before the transaction', async () => {
    expect.hasAssertions()

    const result = await start(contributionDb(null), MEMBER, input({ token: 'tok_other' }))

    expect(result.response).toStrictEqual({
      error: { code: 'PAYMENT_METHOD_UNAVAILABLE' },
      type: 'BUSINESS_ERROR',
    })
    expect(result.calls).toStrictEqual(['payments.findSavedCard'])
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
    expect(result.calls).toStrictEqual(['payments.findSavedCard'])
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

  it('writes nothing when a fund is missing from the table', async () => {
    expect.hasAssertions()

    const result = await start(
      contributionDb(null),
      null,
      input({ contributions: { future: 3, mission: 0, offering: 1, tithe: 0 } }),
    )

    expect(result.response).toStrictEqual({ type: 'SERVER_ERROR' })
    expect(result.trips).toStrictEqual([READ])
    expect(result.events.at(-1)).toMatchObject({
      'error.type': 'no-row',
      event: 'giving.start_contribution.failed',
      level: ERROR,
      msg: 'payments.findFundsByName returned no row for Future',
      op: 'payments.findFundsByName',
    })
    expect(result.events.at(-1)).not.toHaveProperty('err')
  })

  it('writes the guest with the transaction in one batch, so a failed items insert leaves no guest', async () => {
    expect.hasAssertions()

    const result = await start(contributionDb(null).on(insertTransactionItems, fail), null, input())

    expect(result.response).toStrictEqual({ type: 'SERVER_ERROR' })
    expect(result.trips).toStrictEqual([READ, GUEST_WRITE])
    expect(result.events.at(-1)).toMatchObject({
      'error.type': 'Error',
      err: { message: 'connection terminated', type: 'Error' },
      event: 'giving.start_contribution.failed',
      level: ERROR,
      op: GUEST_WRITE.join(' + '),
    })
  })

  it('logs a failed statement without the parameters it was given', async () => {
    expect.hasAssertions()

    const result = await start(contributionDb(null).on(findUserByEmail, fail), null, input())
    const failure = result.events.at(-1)

    expect(result.response).toStrictEqual({ type: 'SERVER_ERROR' })
    expect(result.trips).toStrictEqual([READ])
    expect(failure).toMatchObject({
      event: 'giving.start_contribution.failed',
      op: READ.join(' + '),
    })
    expect(JSON.stringify(failure)).not.toContain('donor@give.test')
  })
})

describe('the pending contribution batches', () => {
  const items = [{ amountInCents: 500, fund: 'offering' as const }]
  const donor = { email: 'donor@give.test', firstName: 'Ada', lastName: 'Lovelace' }

  it.each([
    {
      case: 'the lookup fails',
      fake: () => contributionDb(null).on(findUserByEmail, fail),
      op: READ.join(' + '),
      reason: 'failed',
      trips: [READ],
      user: null,
    },
    {
      case: 'creating the guest fails',
      fake: () => contributionDb(null).on(upsertGuestUser, fail),
      op: GUEST_WRITE.join(' + '),
      reason: 'failed',
      trips: [READ, GUEST_WRITE],
      user: null,
    },
    {
      case: "inserting the guest's transaction returns no row",
      fake: () => contributionDb(null).on(insertPendingGuestTransaction, () => null),
      op: insertPendingGuestTransaction.queryName,
      reason: 'no-row',
      trips: [READ, GUEST_WRITE],
      user: null,
    },
    {
      case: "inserting a member's items fails",
      fake: () => contributionDb(null).on(insertTransactionItems, fail),
      op: USER_WRITE.join(' + '),
      reason: 'failed',
      trips: [READ, USER_WRITE],
      user: MEMBER,
    },
    {
      case: "inserting a member's transaction returns no row",
      fake: () => contributionDb(null).on(insertPendingTransaction, () => null),
      op: insertPendingTransaction.queryName,
      reason: 'no-row',
      trips: [READ, USER_WRITE],
      user: MEMBER,
    },
  ])(
    'is an InfraError, after whole batches, when $case',
    async ({ fake, op, reason, trips, user }) => {
      expect.hasAssertions()

      const db = fake()
      const error = errValue(await createPendingContribution({ db }, items, donor, user))

      expect(error).toBeInstanceOf(InfraError)
      expect(error).toMatchObject({ op, reason })
      expect(db.roundTrips).toStrictEqual(trips)
    },
  )

  it('names the customer and the generated transaction for the gateway', async () => {
    expect.hasAssertions()

    const db = contributionDb(null)
    const recorded = okValue(await createPendingContribution({ db }, items, donor, MEMBER))

    expect(recorded).toStrictEqual({ customerName: 'Ada Lovelace', transactionId: insertedId(db) })
    expect(recorded.transactionId).toMatch(TRANSACTION_ID)
    expect(db.roundTrips).toStrictEqual([READ, USER_WRITE])
  })
})
