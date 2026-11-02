import { pino } from 'pino'
import type { Logger } from 'pino'
import { describe, expect, it, vi } from 'vitest'

import type { TransactionStatus } from '#/core/transaction-status'
import type { FakeDb } from '#/server/testing/fake-db'
import { createFakeDb } from '#/server/testing/fake-db'
import { recordingLogger } from '#/server/testing/recording-logger'
import { errValue, okValue } from '#/server/testing/result'
import { testDeps } from '#/server/testing/test-deps'

import type { CardUse, PaymentRecord, Settling } from './payment-outcome'
import { recordOutcome } from './record-outcome.server'
import { touchSavedCard, upsertSavedCard } from './saved-cards.repository.server'
import { insertPayment, lockTransaction, moveTransaction } from './transactions.repository.server'

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

const storedAs = (createdAs: 'guest' | 'user', status: TransactionStatus = 'pending') =>
  createFakeDb()
    .on(lockTransaction, () => ({ amountInCents: 5000, createdAs, status, userId: 7 }))
    .on(moveTransaction, ({ to }) => ({ status: to }))
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

const MOVE = { from: 'pending', to: 'success', transactionId: 'txn_abc123' }

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
  it('locks the row, moves it, and records the payment at the gateway time', async () => {
    expect.hasAssertions()

    const db = storedAs('guest')
    const result = await record(db, succeeded())

    expect(okValue(result)).toStrictEqual({ from: 'pending', kind: 'moved', to: 'success' })
    expect(db.transactions).toStrictEqual(['commit'])
    expect(db.roundTrips).toStrictEqual([
      ['payments.lockTransaction'],
      ['payments.moveTransaction'],
      ['payments.insertPayment'],
    ])
    expect(db.calls).toStrictEqual([
      { args: ['txn_abc123'], name: 'payments.lockTransaction' },
      { args: [expect.objectContaining(MOVE)], name: 'payments.moveTransaction' },
      { args: [payment()], name: 'payments.insertPayment' },
    ])
  })

  it('moves a pending row to failed on a failed outcome', async () => {
    expect.hasAssertions()

    const db = storedAs('guest')
    const result = await record(db, failed())

    expect(okValue(result)).toStrictEqual({ from: 'pending', kind: 'moved', to: 'failed' })
    expect(db.calls[1]).toStrictEqual({
      args: [expect.objectContaining({ ...MOVE, to: 'failed' })],
      name: 'payments.moveTransaction',
    })
  })

  it('leaves an unknown transaction alone', async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(lockTransaction, () => null)
    const result = await record(db, failed())

    expect(okValue(result)).toStrictEqual({ kind: 'unknown' })
    expect(db.calls.map(({ name }) => name)).toStrictEqual(['payments.lockTransaction'])
    expect(db.transactions).toStrictEqual(['commit'])
  })

  it('absorbs a replay of the stored status without writing', async () => {
    expect.hasAssertions()

    const db = storedAs('user', 'success')
    const result = await record(db, succeeded(newCard))

    expect(okValue(result)).toStrictEqual({ at: 'success', kind: 'absorbed', why: 'replay' })
    expect(db.calls.map(({ name }) => name)).toStrictEqual(['payments.lockTransaction'])
    expect(db.transactions).toStrictEqual(['commit'])
  })

  it('absorbs an answer that contradicts a final status without writing', async () => {
    expect.hasAssertions()

    const db = storedAs('user', 'failed')
    const result = await record(db, succeeded(newCard))

    expect(okValue(result)).toStrictEqual({ at: 'failed', kind: 'absorbed', why: 'contradiction' })
    expect(db.calls.map(({ name }) => name)).toStrictEqual(['payments.lockTransaction'])
  })

  it('fails the settlement when the compare-and-set finds no row after the lock', async () => {
    expect.hasAssertions()

    const db = storedAs('guest').on(moveTransaction, () => null)
    const result = await record(db, succeeded())

    expect(errValue(result)).toMatchObject({
      _tag: 'InfraError',
      op: 'payments.moveTransaction',
      reason: 'no-row',
    })
    expect(db.calls.map(({ name }) => name)).toStrictEqual([
      'payments.lockTransaction',
      'payments.moveTransaction',
    ])
    expect(db.transactions).toStrictEqual(['rollback'])
  })

  it("saves the card from a user's successful payment", async () => {
    expect.hasAssertions()

    const db = storedAs('user')
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

    const db = storedAs('user')
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

    const db = storedAs(createdAs)
    await record(db, outcome)

    expect(db.calls.map(({ name }) => name)).toStrictEqual([
      'payments.lockTransaction',
      'payments.moveTransaction',
      'payments.insertPayment',
    ])
  })

  it('records the payment at the time of recording when the gateway gave none', async () => {
    expect.hasAssertions()

    const db = storedAs('guest')
    await record(db, succeeded(null, paidRecord({ paidAt: null })))

    // now() is a TZDate, which toStrictEqual would not equate with a Date of the same time.
    expect(db.calls[2]).toMatchObject({
      args: [payment({ paidAt: NOW })],
      name: 'payments.insertPayment',
    })
  })

  it('rolls the settlement back and names the failed write', async () => {
    expect.hasAssertions()

    const db = storedAs('guest').on(insertPayment, () => {
      throw new Error('insert failed')
    })
    const result = await record(db, succeeded())

    expect(errValue(result)).toMatchObject({ _tag: 'InfraError', op: 'payments.insertPayment' })
    expect(db.transactions).toStrictEqual(['rollback'])
  })

  it('rolls the settlement and the payment back when the card cannot be saved', async () => {
    expect.hasAssertions()

    const db = storedAs('user').on(upsertSavedCard, () => {
      throw new Error('upsert failed')
    })
    const result = await record(db, succeeded(newCard))

    expect(errValue(result)).toMatchObject({ _tag: 'InfraError', op: 'payments.upsertSavedCard' })
    expect(db.calls.map(({ name }) => name)).toStrictEqual([
      'payments.lockTransaction',
      'payments.moveTransaction',
      'payments.insertPayment',
      'payments.upsertSavedCard',
    ])
    expect(db.transactions).toStrictEqual(['rollback'])
  })

  it('logs a replay and an unknown transaction as idempotent, as before', async () => {
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
    await record(storedAs('guest', 'success'), succeeded(), logger)
    await record(
      createFakeDb().on(lockTransaction, () => null),
      succeeded(),
      logger,
    )

    expect(events).toMatchObject([
      { event: 'payment.finalize.idempotent', transaction_id: 'txn_abc123' },
      { event: 'payment.finalize.idempotent', transaction_id: 'txn_abc123' },
    ])
  })

  it('logs a contradiction as a warning naming both statuses', async () => {
    expect.hasAssertions()

    const { events, logger } = recordingLogger()
    await record(storedAs('guest', 'success'), failed(), logger)

    expect(events).toStrictEqual([
      expect.objectContaining({
        event: 'payment.finalize.contradiction',
        level: 40,
        status: 'success',
        to: 'failed',
        transaction_id: 'txn_abc123',
      }),
    ])
  })
})
