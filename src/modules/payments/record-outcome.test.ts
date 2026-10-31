import { pino } from 'pino'
import type { Logger } from 'pino'
import { describe, expect, it, vi } from 'vitest'

import type { FakeDb } from '#/server/testing/fake-db'
import { createFakeDb } from '#/server/testing/fake-db'
import { errValue, okValue } from '#/server/testing/result'
import { testDeps } from '#/server/testing/test-deps'

import type { EghlPaymentResponse } from './eghl.wire'
import { EghlTxnStatus } from './eghl.wire'
import { recordOutcome } from './record-outcome.server'
import { touchSavedCard, upsertSavedCard } from './saved-cards.repository.server'
import { insertPayment, settleTransaction } from './transactions.repository.server'

const NOW = new Date('2026-10-31T04:00:00Z')

const reply = (overrides: Partial<EghlPaymentResponse> = {}): EghlPaymentResponse => ({
  Amount: '50.00',
  CurrencyCode: 'MYR',
  HashValue: 'hash',
  HashValue2: 'hash2',
  OrderNumber: 'txn_abc123',
  PaymentID: 'txn_abc123',
  PymtMethod: 'CC',
  RespTime: '2026-10-31 11:30:00',
  ServiceID: 'service-123',
  TransactionType: 'SALE',
  TxnID: 'CIVtxn_abc123',
  TxnMessage: 'Transaction Successful',
  TxnStatus: EghlTxnStatus.Success,
  ...overrides,
})

const newCard = {
  CardExp: '209912',
  CardHolder: 'ADA LOVELACE',
  CardNoMask: '411111******1111',
  CardType: 'VISA',
  Token: 'tok_new',
  TokenType: 'OCP',
}

/** A db whose pending transaction belongs to user 7, created as `createdAs`. */
const pendingFor = (createdAs: 'guest' | 'user') =>
  createFakeDb()
    .on(settleTransaction, () => ({ createdAs, userId: 7 }))
    .on(insertPayment, () => {})
    .on(upsertSavedCard, () => {})
    .on(touchSavedCard, () => {})

const payment = (overrides: Record<string, unknown> = {}) => ({
  message: 'Transaction Successful',
  paidAt: new Date('2026-10-31T03:30:00Z'),
  paymentMethod: 'CC',
  provider: 'eghl',
  providerTransactionId: 'CIVtxn_abc123',
  transactionId: 'txn_abc123',
  ...overrides,
})

/** Runs recordOutcome with the clock at NOW. */
const record = async (
  db: FakeDb,
  response: EghlPaymentResponse,
  status: 'failed' | 'success',
  logger?: Logger,
) => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  try {
    return await recordOutcome(testDeps({ db, ...(logger && { logger }) }), response, status)
  } finally {
    vi.useRealTimers()
  }
}

describe('recording a payment outcome', () => {
  it('settles the pending transaction and records the payment at the gateway time', async () => {
    expect.hasAssertions()

    const db = pendingFor('guest')
    const result = await record(db, reply(), 'success')

    expect(okValue(result)).toStrictEqual({ finalized: true })
    expect(db.transactions).toStrictEqual(['commit'])
    // paidAt is a TZDate, which toStrictEqual would not equate with a Date of the same time.
    expect(db.calls).toMatchObject([
      { args: ['txn_abc123', 'success'], name: 'payments.settleTransaction' },
      { args: [payment()], name: 'payments.insertPayment' },
    ])
  })

  it('leaves a transaction that is no longer pending alone', async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(settleTransaction, () => null)
    const result = await record(db, reply(), 'failed')

    expect(okValue(result)).toStrictEqual({ finalized: false })
    expect(db.calls.map(({ name }) => name)).toStrictEqual(['payments.settleTransaction'])
  })

  it("saves the card from a user's successful payment", async () => {
    expect.hasAssertions()

    const db = pendingFor('user')
    await record(db, reply(newCard), 'success')

    expect(db.calls.at(-1)).toStrictEqual({
      args: [
        {
          cardExp: '209912',
          cardHolder: 'ADA LOVELACE',
          cardNoMask: '411111******1111',
          cardType: 'VISA',
          token: 'tok_new',
          userId: 7,
        },
      ],
      name: 'payments.upsertSavedCard',
    })
  })

  it('touches the saved card a user paid with by token alone', async () => {
    expect.hasAssertions()

    const db = pendingFor('user')
    await record(db, reply({ Token: 'tok_saved', TokenType: 'OCP' }), 'success')

    expect(db.calls.at(-1)).toStrictEqual({
      args: [7, 'tok_saved'],
      name: 'payments.touchSavedCard',
    })
  })

  it.each([
    ['a guest payment', 'guest', 'success'],
    ['a failed payment', 'user', 'failed'],
  ] as const)('saves no card for %s', async (_case, createdAs, status) => {
    expect.hasAssertions()

    const db = pendingFor(createdAs)
    await record(db, reply(newCard), status)

    expect(db.calls.map(({ name }) => name)).toStrictEqual([
      'payments.settleTransaction',
      'payments.insertPayment',
    ])
  })

  it('saves no card when the token is not a one-click payment token', async () => {
    expect.hasAssertions()

    const db = pendingFor('user')
    await record(db, reply({ ...newCard, TokenType: 'OTHER' }), 'success')

    expect(db.calls.map(({ name }) => name)).toStrictEqual([
      'payments.settleTransaction',
      'payments.insertPayment',
    ])
  })

  it.each([
    [
      'RespTime2 when RespTime is absent',
      { RespTime: undefined, RespTime2: '2026-10-30 08:00:00' },
      new Date('2026-10-30T00:00:00Z'),
    ],
    ['now when the reply has no time', { RespTime: undefined }, NOW],
    ['now when the time does not parse', { RespTime: 'not a time' }, NOW],
  ])('records the payment time from %s', async (_case, overrides, paidAt) => {
    expect.hasAssertions()

    const db = pendingFor('guest')
    await record(db, reply(overrides), 'success')

    expect(db.calls[1]).toMatchObject({
      args: [payment({ paidAt })],
      name: 'payments.insertPayment',
    })
  })

  it('rolls the settlement back and names the failed write', async () => {
    expect.hasAssertions()

    const db = createFakeDb()
      .on(settleTransaction, () => ({ createdAs: 'guest', userId: 7 }))
      .on(insertPayment, () => {
        throw new Error('insert failed')
      })
    const result = await record(db, reply(), 'success')

    expect(errValue(result)).toMatchObject({ _tag: 'InfraError', op: 'payments.insertPayment' })
    expect(db.transactions).toStrictEqual(['rollback'])
  })

  it('rolls the settlement and the payment back when the card cannot be saved', async () => {
    expect.hasAssertions()

    const db = pendingFor('user').on(upsertSavedCard, () => {
      throw new Error('upsert failed')
    })
    const result = await record(db, reply(newCard), 'success')

    expect(errValue(result)).toMatchObject({ _tag: 'InfraError', op: 'payments.upsertSavedCard' })
    expect(db.calls.map(({ name }) => name)).toStrictEqual([
      'payments.settleTransaction',
      'payments.insertPayment',
      'payments.upsertSavedCard',
    ])
    expect(db.transactions).toStrictEqual(['rollback'])
  })

  it('logs the replay of a settled transaction', async () => {
    expect.hasAssertions()

    const events: unknown[] = []
    const logger = pino(
      { level: 'info' },
      {
        write: (line: string) => {
          events.push(JSON.parse(line))
        },
      },
    )
    const db = createFakeDb().on(settleTransaction, () => null)
    await record(db, reply(), 'success', logger)

    expect(events).toMatchObject([
      { event: 'payment.finalize.idempotent', transaction_id: 'txn_abc123' },
    ])
  })
})
