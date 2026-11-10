import { SpanStatusCode } from '@opentelemetry/api'
import { pino } from 'pino'
import type { Logger } from 'pino'
import { describe, expect, it, vi } from 'vitest'

import type { TransactionStatus } from '#/core/transaction-status'
import type { FakeDb } from '#/server/testing/fake-db'
import { createFakeDb } from '#/server/testing/fake-db'
import { recordingLogger } from '#/server/testing/recording-logger'
import { errValue, okValue } from '#/server/testing/result'
import { inRequestSpan } from '#/server/testing/spans'
import { testDeps } from '#/server/testing/test-deps'

import type { CardUse, PaymentRecord, Settling } from './payment-outcome'
import { recordOutcome } from './record-outcome.server'
import { touchSavedCard, upsertSavedCard } from './saved-cards.repository.server'
import {
  findProviderTxnIds,
  insertPayment,
  lockTransaction,
  moveTransaction,
} from './transactions.repository.server'

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

const cancelled = (): Settling => ({
  kind: 'cancelled',
  record: paidRecord({ message: 'Buyer cancelled', paidAt: null, providerTxnId: '' }),
})

const refunded = (): Settling => ({
  kind: 'refunded',
  record: paidRecord({ message: 'Transaction refunded' }),
  refund: { cents: 5000, kind: 'total' },
})

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

const storedAs = (
  createdAs: 'guest' | 'user',
  status: TransactionStatus = 'pending',
  providerTxnIds: (string | null)[] = [],
) =>
  createFakeDb()
    .on(lockTransaction, () => ({ amountInCents: 5000, createdAs, status, userId: 7 }))
    .on(findProviderTxnIds, () => providerTxnIds)
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
    return await recordOutcome(testDeps({ db, ...(logger && { logger }) }), outcome, 'callback')
  } finally {
    vi.useRealTimers()
  }
}

describe('recording a payment outcome', () => {
  it('locks the row, moves it, and records the payment at the gateway time', async () => {
    expect.hasAssertions()

    const db = storedAs('guest')
    const result = await record(db, succeeded())

    expect(okValue(result)).toStrictEqual({
      from: 'pending',
      kind: 'moved',
      to: 'success',
      via: 'succeeded',
    })
    expect(db.transactions).toStrictEqual(['commit'])
    expect(db.roundTrips).toStrictEqual([
      ['payments.lockTransaction'],
      ['payments.findProviderTxnIds'],
      ['payments.moveTransaction'],
      ['payments.insertPayment'],
    ])
    expect(db.calls).toStrictEqual([
      { args: ['txn_abc123'], name: 'payments.lockTransaction' },
      { args: ['txn_abc123'], name: 'payments.findProviderTxnIds' },
      { args: [expect.objectContaining(MOVE)], name: 'payments.moveTransaction' },
      { args: [payment()], name: 'payments.insertPayment' },
    ])
  })

  it('moves a pending row to failed on a failed outcome', async () => {
    expect.hasAssertions()

    const db = storedAs('guest')
    const result = await record(db, failed())

    expect(okValue(result)).toStrictEqual({
      from: 'pending',
      kind: 'moved',
      to: 'failed',
      via: 'failed',
    })
    expect(db.calls[2]).toStrictEqual({
      args: [expect.objectContaining({ ...MOVE, to: 'failed' })],
      name: 'payments.moveTransaction',
    })
  })

  it("moves a pending row to cancelled and records the reply's payment, with no card step", async () => {
    expect.hasAssertions()

    const { events, logger } = recordingLogger()
    const db = storedAs('user')
    const result = await record(db, cancelled(), logger)

    expect(okValue(result)).toStrictEqual({
      from: 'pending',
      kind: 'moved',
      to: 'cancelled',
      via: 'cancelled',
    })
    expect(db.calls.map(({ name }) => name)).toStrictEqual([
      'payments.lockTransaction',
      'payments.findProviderTxnIds',
      'payments.moveTransaction',
      'payments.insertPayment',
    ])
    expect(db.calls[2]).toStrictEqual({
      args: [expect.objectContaining({ ...MOVE, to: 'cancelled' })],
      name: 'payments.moveTransaction',
    })
    expect(db.calls[3]).toMatchObject({
      args: [payment({ message: 'Buyer cancelled', paidAt: NOW, providerTransactionId: '' })],
      name: 'payments.insertPayment',
    })
    expect(events).toStrictEqual([])
  })

  it("moves a pending row to refunded and records the answer's payment, with no card step and a warning naming the money", async () => {
    expect.hasAssertions()

    const { events, logger } = recordingLogger()
    const db = storedAs('user')
    const { settled, span } = await inRequestSpan(() => record(db, refunded(), logger))

    expect(settled).toMatchObject({
      status: 'fulfilled',
      value: { value: { from: 'pending', kind: 'moved', to: 'refunded', via: 'refunded' } },
    })
    expect(db.calls).toStrictEqual([
      { args: ['txn_abc123'], name: 'payments.lockTransaction' },
      { args: ['txn_abc123'], name: 'payments.findProviderTxnIds' },
      {
        args: [expect.objectContaining({ ...MOVE, to: 'refunded' })],
        name: 'payments.moveTransaction',
      },
      { args: [payment({ message: 'Transaction refunded' })], name: 'payments.insertPayment' },
    ])
    expect(db.transactions).toStrictEqual(['commit'])
    expect(events).toStrictEqual([
      expect.objectContaining({
        amount_in_cents: 5000,
        currency: 'MYR',
        event: 'payment.finalize.refunded',
        level: 40,
        method: 'CC',
        provider_txn_id: 'CIVtxn_abc123',
        refunded_amount_in_cents: 5000,
        source: 'callback',
        stored_amount_in_cents: 5000,
        transaction_id: 'txn_abc123',
      }),
    ])
    expect(span.status.code).toBe(SpanStatusCode.UNSET)
  })

  it('fails an expired row without recording a payment', async () => {
    expect.hasAssertions()

    const db = storedAs('user')
    const result = await record(db, { kind: 'expired', transactionId: 'txn_abc123' })

    expect(okValue(result)).toStrictEqual({
      from: 'pending',
      kind: 'moved',
      to: 'failed',
      via: 'expired',
    })
    expect(db.calls).toStrictEqual([
      { args: ['txn_abc123'], name: 'payments.lockTransaction' },
      { args: ['txn_abc123'], name: 'payments.findProviderTxnIds' },
      {
        args: [expect.objectContaining({ ...MOVE, to: 'failed' })],
        name: 'payments.moveTransaction',
      },
    ])
    expect(db.transactions).toStrictEqual(['commit'])
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
    expect(db.calls.map(({ name }) => name)).toStrictEqual([
      'payments.lockTransaction',
      'payments.findProviderTxnIds',
    ])
    expect(db.transactions).toStrictEqual(['commit'])
  })

  it('absorbs an answer that contradicts a final status without writing', async () => {
    expect.hasAssertions()

    const db = storedAs('user', 'success')
    const result = await record(db, failed())

    expect(okValue(result)).toStrictEqual({ at: 'success', kind: 'absorbed', why: 'contradiction' })
    expect(db.calls.map(({ name }) => name)).toStrictEqual([
      'payments.lockTransaction',
      'payments.findProviderTxnIds',
    ])
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
      'payments.findProviderTxnIds',
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
      'payments.findProviderTxnIds',
      'payments.moveTransaction',
      'payments.insertPayment',
    ])
  })

  it('records the payment at the time of recording when the gateway gave none', async () => {
    expect.hasAssertions()

    const db = storedAs('guest')
    await record(db, succeeded(null, paidRecord({ paidAt: null })))

    // now() is a TZDate, which toStrictEqual would not equate with a Date of the same time.
    expect(db.calls[3]).toMatchObject({
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
      'payments.findProviderTxnIds',
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
      { event: 'payment.finalize.idempotent', source: 'callback', transaction_id: 'txn_abc123' },
      { event: 'payment.finalize.idempotent', source: 'callback', transaction_id: 'txn_abc123' },
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
        source: 'callback',
        status: 'success',
        to: 'failed',
        transaction_id: 'txn_abc123',
      }),
    ])
  })
})

describe('a success whose money does not match the row', () => {
  it.each([
    ['amount', paidRecord({ amountInCents: 9900 }), 'amount_mismatch'],
    ['currency', paidRecord({ currency: 'USD' }), 'currency_mismatch'],
  ] as const)(
    'moves the row to held on another %s, with no payment or card',
    async (_money, paid, why) => {
      expect.hasAssertions()

      const db = storedAs('user')
      const result = await record(db, succeeded(newCard, paid))

      expect(okValue(result)).toStrictEqual({ kind: 'held', why })
      expect(db.calls).toStrictEqual([
        { args: ['txn_abc123'], name: 'payments.lockTransaction' },
        { args: ['txn_abc123'], name: 'payments.findProviderTxnIds' },
        {
          args: [expect.objectContaining({ ...MOVE, to: 'held' })],
          name: 'payments.moveTransaction',
        },
      ])
      expect(db.transactions).toStrictEqual(['commit'])
    },
  )

  it('fails the hold, without the alert, when the compare-and-set finds no row', async () => {
    expect.hasAssertions()

    const { events, logger } = recordingLogger()
    const db = storedAs('guest').on(moveTransaction, () => null)
    const result = await record(db, succeeded(null, paidRecord({ amountInCents: 9900 })), logger)

    expect(errValue(result)).toMatchObject({
      _tag: 'InfraError',
      op: 'payments.moveTransaction',
      reason: 'no-row',
    })
    expect(db.transactions).toStrictEqual(['rollback'])
    expect(events).toStrictEqual([])
  })

  it.each([
    ['the same mismatched success', succeeded(null, paidRecord({ amountInCents: 9900 })), 'replay'],
    ['a matching success', succeeded(), 'contradiction'],
    ['a failure', failed(), 'contradiction'],
    ['an expiry', { kind: 'expired', transactionId: 'txn_abc123' }, 'contradiction'],
  ] as const)('leaves a held row as it is on %s', async (_case, outcome, why) => {
    expect.hasAssertions()

    const db = storedAs('guest', 'held')
    const result = await record(db, outcome)

    expect(okValue(result)).toStrictEqual({ at: 'held', kind: 'absorbed', why })
    expect(db.calls.map(({ name }) => name)).toStrictEqual([
      'payments.lockTransaction',
      'payments.findProviderTxnIds',
    ])
  })

  it.each([
    ['amount', paidRecord({ amountInCents: 9900 }), 'payment.finalize.amount_mismatch'],
    ['currency', paidRecord({ currency: 'USD' }), 'payment.finalize.currency_mismatch'],
  ] as const)(
    'logs another %s as an error with both amounts and the charge to look up, and fails the request span',
    async (_money, paid, event) => {
      expect.hasAssertions()

      const { events, logger } = recordingLogger()
      const { span } = await inRequestSpan(() =>
        record(storedAs('guest'), succeeded(null, paid), logger),
      )

      expect(events).toStrictEqual([
        expect.objectContaining({
          amount_in_cents: paid.amountInCents,
          currency: paid.currency,
          event,
          from: 'pending',
          level: 50,
          method: 'CC',
          provider_txn_id: 'CIVtxn_abc123',
          source: 'callback',
          stored_amount_in_cents: 5000,
          transaction_id: 'txn_abc123',
        }),
      ])
      expect(span.status.code).toBe(SpanStatusCode.ERROR)
      expect(span.attributes['error.type']).toBe(event)
    },
  )

  it('leaves the request span as it is when the money matches', async () => {
    expect.hasAssertions()

    const { span } = await inRequestSpan(() => record(storedAs('guest'), succeeded()))

    expect(span.status.code).toBe(SpanStatusCode.UNSET)
  })
})

describe('a success onto a failed row', () => {
  it('moves the row to success and records a new payment, keeping the failed one', async () => {
    expect.hasAssertions()

    const db = storedAs('guest', 'failed')
    const result = await record(db, succeeded())

    expect(okValue(result)).toStrictEqual({
      from: 'failed',
      kind: 'moved',
      to: 'success',
      via: 'succeeded',
    })
    expect(db.calls).toStrictEqual([
      { args: ['txn_abc123'], name: 'payments.lockTransaction' },
      { args: ['txn_abc123'], name: 'payments.findProviderTxnIds' },
      {
        args: [expect.objectContaining({ ...MOVE, from: 'failed' })],
        name: 'payments.moveTransaction',
      },
      { args: [payment()], name: 'payments.insertPayment' },
    ])
    expect(db.transactions).toStrictEqual(['commit'])
  })

  it.each([
    ['saves a new card', newCard, 'payments.upsertSavedCard'],
    ['touches a saved card', { kind: 'reused', token: 'tok_saved' }, 'payments.touchSavedCard'],
  ] as const)("%s from a user's late payment", async (_case, card, write) => {
    expect.hasAssertions()

    const db = storedAs('user', 'failed')
    await record(db, succeeded(card))

    expect(db.calls.map(({ name }) => name)).toStrictEqual([
      'payments.lockTransaction',
      'payments.findProviderTxnIds',
      'payments.moveTransaction',
      'payments.insertPayment',
      write,
    ])
  })

  it('logs a late success over a gateway failure under another TxnID as an error naming the charge, and fails the request span', async () => {
    expect.hasAssertions()

    const { events, logger } = recordingLogger()
    const { span } = await inRequestSpan(() =>
      record(storedAs('guest', 'failed', ['CIVdeclined']), succeeded(), logger),
    )

    expect(events).toStrictEqual([
      expect.objectContaining({
        event: 'payment.finalize.late_success',
        from: 'failed',
        level: 50,
        provider_txn_id: 'CIVtxn_abc123',
        source: 'callback',
        transaction_id: 'txn_abc123',
      }),
    ])
    expect(span.status.code).toBe(SpanStatusCode.ERROR)
    expect(span.attributes['error.type']).toBe('payment.finalize.late_success')
  })

  it.each([
    ['no payments row (the cron expired it)', []],
    ['the empty TxnID of a cancel recorded before the cancelled status', ['']],
    ['payments rows with no TxnID', [null, '']],
  ] as const)(
    'logs a late success onto a failed row with %s as a warning, not a gateway failure',
    async (_case, providerTxnIds) => {
      expect.hasAssertions()

      const { events, logger } = recordingLogger()
      const { span } = await inRequestSpan(() =>
        record(storedAs('guest', 'failed', [...providerTxnIds]), succeeded(), logger),
      )

      expect(events).toStrictEqual([
        expect.objectContaining({
          event: 'payment.finalize.late_success',
          from: 'failed',
          level: 40,
          msg: 'Gateway reports a success for a failed transaction with no gateway TxnID, recording the success',
          provider_txn_id: 'CIVtxn_abc123',
          source: 'callback',
          transaction_id: 'txn_abc123',
        }),
      ])
      expect(span.status.code).toBe(SpanStatusCode.UNSET)
    },
  )

  it.each([
    ['the same money', paidRecord()],
    ['another amount', paidRecord({ amountInCents: 9900 })],
  ] as const)(
    'holds a success for %s under the TxnID a payments row carries, with no payment or card, and one conflict alert',
    async (_money, paid) => {
      expect.hasAssertions()

      const { events, logger } = recordingLogger()
      const db = storedAs('user', 'failed', ['CIVtxn_abc123'])
      const { settled, span } = await inRequestSpan(() =>
        record(db, succeeded(newCard, paid), logger),
      )

      expect(settled).toMatchObject({
        status: 'fulfilled',
        value: { value: { kind: 'held', why: 'conflict' } },
      })
      expect(db.calls).toStrictEqual([
        { args: ['txn_abc123'], name: 'payments.lockTransaction' },
        { args: ['txn_abc123'], name: 'payments.findProviderTxnIds' },
        {
          args: [expect.objectContaining({ from: 'failed', to: 'held' })],
          name: 'payments.moveTransaction',
        },
      ])
      expect(db.transactions).toStrictEqual(['commit'])
      expect(events).toStrictEqual([
        expect.objectContaining({
          amount_in_cents: paid.amountInCents,
          currency: 'MYR',
          event: 'payment.finalize.conflict',
          from: 'failed',
          level: 50,
          method: 'CC',
          provider_txn_id: 'CIVtxn_abc123',
          source: 'callback',
          stored_amount_in_cents: 5000,
          transaction_id: 'txn_abc123',
        }),
      ])
      expect([span.status.code, span.attributes['error.type']]).toStrictEqual([
        SpanStatusCode.ERROR,
        'payment.finalize.conflict',
      ])
    },
  )

  it('rolls the late success back without the alert when the payment cannot be written', async () => {
    expect.hasAssertions()

    const { events, logger } = recordingLogger()
    const db = storedAs('guest', 'failed').on(insertPayment, () => {
      throw new Error('insert failed')
    })
    const result = await record(db, succeeded(), logger)

    expect(errValue(result)).toMatchObject({ _tag: 'InfraError', op: 'payments.insertPayment' })
    expect(db.transactions).toStrictEqual(['rollback'])
    expect(events).toStrictEqual([])
  })

  it('moves the row to held for other money, with the hold alert naming the failed status', async () => {
    expect.hasAssertions()

    const { events, logger } = recordingLogger()
    const db = storedAs('user', 'failed')
    const result = await record(db, succeeded(newCard, paidRecord({ amountInCents: 9900 })), logger)

    expect(okValue(result)).toStrictEqual({ kind: 'held', why: 'amount_mismatch' })
    expect(db.calls).toStrictEqual([
      { args: ['txn_abc123'], name: 'payments.lockTransaction' },
      { args: ['txn_abc123'], name: 'payments.findProviderTxnIds' },
      {
        args: [expect.objectContaining({ from: 'failed', to: 'held' })],
        name: 'payments.moveTransaction',
      },
    ])
    expect(events).toStrictEqual([
      expect.objectContaining({
        event: 'payment.finalize.amount_mismatch',
        from: 'failed',
        level: 50,
      }),
    ])
  })

  it.each([
    ['a failure', failed()],
    ['an expiry', { kind: 'expired', transactionId: 'txn_abc123' }],
  ] as const)('leaves a failed row as it is on %s', async (_case, outcome) => {
    expect.hasAssertions()

    const db = storedAs('guest', 'failed')
    const result = await record(db, outcome)

    expect(okValue(result)).toStrictEqual({ at: 'failed', kind: 'absorbed', why: 'replay' })
    expect(db.calls.map(({ name }) => name)).toStrictEqual([
      'payments.lockTransaction',
      'payments.findProviderTxnIds',
    ])
  })
})

describe('a success onto a cancelled row', () => {
  it("moves the row to success and records the success beside the cancel's payment", async () => {
    expect.hasAssertions()

    const db = storedAs('guest', 'cancelled', [''])
    const result = await record(db, succeeded())

    expect(okValue(result)).toStrictEqual({
      from: 'cancelled',
      kind: 'moved',
      to: 'success',
      via: 'succeeded',
    })
    expect(db.calls).toStrictEqual([
      { args: ['txn_abc123'], name: 'payments.lockTransaction' },
      { args: ['txn_abc123'], name: 'payments.findProviderTxnIds' },
      {
        args: [expect.objectContaining({ ...MOVE, from: 'cancelled' })],
        name: 'payments.moveTransaction',
      },
      { args: [payment()], name: 'payments.insertPayment' },
    ])
  })

  it('logs the late success as a warning that names the cancel, and leaves the request span as it is', async () => {
    expect.hasAssertions()

    const { events, logger } = recordingLogger()
    const { span } = await inRequestSpan(() =>
      record(storedAs('guest', 'cancelled', ['']), succeeded(), logger),
    )

    expect(events).toStrictEqual([
      expect.objectContaining({
        event: 'payment.finalize.late_success',
        from: 'cancelled',
        level: 40,
        msg: 'Gateway reports a success for a transaction whose page was cancelled or timed out, recording the success',
        provider_txn_id: 'CIVtxn_abc123',
        source: 'callback',
        transaction_id: 'txn_abc123',
      }),
    ])
    expect(span.status.code).toBe(SpanStatusCode.UNSET)
  })

  it.each([
    ['a failure', failed(), 'contradiction'],
    ['an expiry', { kind: 'expired', transactionId: 'txn_abc123' }, 'contradiction'],
    ['another cancel', cancelled(), 'replay'],
  ] as const)('leaves a cancelled row as it is on %s', async (_case, outcome, why) => {
    expect.hasAssertions()

    const db = storedAs('guest', 'cancelled', [''])
    const result = await record(db, outcome)

    expect(okValue(result)).toStrictEqual({ at: 'cancelled', kind: 'absorbed', why })
    expect(db.calls.map(({ name }) => name)).toStrictEqual([
      'payments.lockTransaction',
      'payments.findProviderTxnIds',
    ])
  })
})

describe('a refunded row', () => {
  it.each([
    ['a success under its TxnID', succeeded(), 'contradiction', ['CIVtxn_abc123']],
    ['a success under a new TxnID', succeeded(), 'contradiction', ['CIVother']],
    ['a failure', failed(), 'contradiction', ['CIVtxn_abc123']],
    ['a cancel', cancelled(), 'contradiction', ['CIVtxn_abc123']],
    ['an expiry', { kind: 'expired', transactionId: 'txn_abc123' }, 'contradiction', []],
    ['another refund', refunded(), 'replay', ['CIVtxn_abc123']],
  ] as const)('absorbs %s without writing', async (_case, outcome, why, providerTxnIds) => {
    expect.hasAssertions()

    const db = storedAs('user', 'refunded', [...providerTxnIds])
    const result = await record(db, outcome)

    expect(okValue(result)).toStrictEqual({ at: 'refunded', kind: 'absorbed', why })
    expect(db.calls.map(({ name }) => name)).toStrictEqual([
      'payments.lockTransaction',
      'payments.findProviderTxnIds',
    ])
  })
})

describe('a refund the gateway does not show to be the whole donation', () => {
  it.each([
    ['a partial refunded total', { cents: 2500, kind: 'total' }, 2500],
    ['an unreadable refunded total', { kind: 'unreadable' }, null],
  ] as const)(
    'moves the row to held on %s, with no payment, and alerts with both amounts',
    async (_case, refund, refundedCents) => {
      expect.hasAssertions()

      const { events, logger } = recordingLogger()
      const db = storedAs('guest')
      const result = await record(
        db,
        { kind: 'refunded', record: paidRecord({ message: 'Transaction refunded' }), refund },
        logger,
      )

      expect(okValue(result)).toStrictEqual({ kind: 'held', why: 'refund_mismatch' })
      expect(db.calls.map(({ name }) => name)).toStrictEqual([
        'payments.lockTransaction',
        'payments.findProviderTxnIds',
        'payments.moveTransaction',
      ])
      expect(events).toStrictEqual([
        expect.objectContaining({
          amount_in_cents: 5000,
          event: 'payment.finalize.refund_mismatch',
          from: 'pending',
          level: 50,
          refunded_amount_in_cents: refundedCents,
          stored_amount_in_cents: 5000,
        }),
      ])
    },
  )
})
