import { pino } from 'pino'
import type { Logger } from 'pino'
import { describe, expect, it, vi } from 'vitest'

import type { FakeDb } from '#/server/testing/fake-db'
import { createFakeDb } from '#/server/testing/fake-db'
import { errValue, okValue } from '#/server/testing/result'
import { testDeps } from '#/server/testing/test-deps'

import type { CardUse, PaymentRecord, Settling } from './payment-outcome'
import { recordOutcome } from './record-outcome.server'
import { touchSavedCard, upsertSavedCard } from './saved-cards.repository.server'
import { insertPayment, settleTransaction } from './transactions.repository.server'

const NOW = new Date('2026-10-31T04:00:00Z')

const paidRecord = (overrides: Partial<PaymentRecord> = {}): PaymentRecord => ({
  amountInCents: 5000,
  currency: 'MYR',
  message: 'Transaction Successful',
  method: 'CC',
  paidAt: new Date('2026-10-31T03:30:00Z'),
  providerTxnId: 'CIVtxn_abc123',
  transactionId: 'txn_abc123',
  ...overrides,
})

const succeeded = (card: CardUse | null = null, record = paidRecord()): Settling => ({
  card,
  kind: 'succeeded',
  record,
})

const failed = (): Settling => ({ kind: 'failed', record: paidRecord() })

const newCard: CardUse = {
  card: {
    exp: '209912',
    holder: 'ADA LOVELACE',
    mask: '411111******1111',
    token: 'tok_new',
    type: 'VISA',
  },
  kind: 'saved',
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
const record = async (db: FakeDb, outcome: Settling, logger?: Logger) => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  try {
    return await recordOutcome(testDeps({ db, ...(logger && { logger }) }), outcome)
  } finally {
    vi.useRealTimers()
  }
}

describe('recording a payment outcome', () => {
  it('settles the pending transaction and records the payment at the gateway time', async () => {
    expect.hasAssertions()

    const db = pendingFor('guest')
    const result = await record(db, succeeded())

    expect(okValue(result)).toStrictEqual({ finalized: true })
    expect(db.transactions).toStrictEqual(['commit'])
    expect(db.calls).toMatchObject([
      { args: ['txn_abc123', 'success'], name: 'payments.settleTransaction' },
      { args: [payment()], name: 'payments.insertPayment' },
    ])
  })

  it('leaves a transaction that is no longer pending alone', async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(settleTransaction, () => null)
    const result = await record(db, failed())

    expect(okValue(result)).toStrictEqual({ finalized: false })
    expect(db.calls.map(({ name }) => name)).toStrictEqual(['payments.settleTransaction'])
  })

  it("saves the card from a user's successful payment", async () => {
    expect.hasAssertions()

    const db = pendingFor('user')
    await record(db, succeeded(newCard))

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
    await record(db, succeeded({ kind: 'reused', token: 'tok_saved' }))

    expect(db.calls.at(-1)).toStrictEqual({
      args: [7, 'tok_saved'],
      name: 'payments.touchSavedCard',
    })
  })

  it.each([
    ['a guest payment', 'guest', succeeded(newCard)],
    ['a failed payment', 'user', failed()],
    ['a payment with no one-click card', 'user', succeeded(null)],
  ] as const)('saves no card for %s', async (_case, createdAs, outcome) => {
    expect.hasAssertions()

    const db = pendingFor(createdAs)
    await record(db, outcome)

    expect(db.calls.map(({ name }) => name)).toStrictEqual([
      'payments.settleTransaction',
      'payments.insertPayment',
    ])
  })

  it('records the payment at the time of recording when the gateway gave none', async () => {
    expect.hasAssertions()

    const db = pendingFor('guest')
    await record(db, succeeded(null, paidRecord({ paidAt: null })))

    // now() is a TZDate, which toStrictEqual would not equate with a Date of the same time.
    expect(db.calls[1]).toMatchObject({
      args: [payment({ paidAt: NOW })],
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
    const result = await record(db, succeeded())

    expect(errValue(result)).toMatchObject({ _tag: 'InfraError', op: 'payments.insertPayment' })
    expect(db.transactions).toStrictEqual(['rollback'])
  })

  it('rolls the settlement and the payment back when the card cannot be saved', async () => {
    expect.hasAssertions()

    const db = pendingFor('user').on(upsertSavedCard, () => {
      throw new Error('upsert failed')
    })
    const result = await record(db, succeeded(newCard))

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
    await record(db, succeeded(), logger)

    expect(events).toMatchObject([
      { event: 'payment.finalize.idempotent', transaction_id: 'txn_abc123' },
    ])
  })
})
