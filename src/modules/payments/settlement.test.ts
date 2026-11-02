import { Result } from 'better-result'
import { describe, expect, it, vi } from 'vitest'

import { createFakeDb } from '#/server/testing/fake-db'
import { recordingLogger } from '#/server/testing/recording-logger'
import { okValue } from '#/server/testing/result'
import { testDeps } from '#/server/testing/test-deps'

import type { PaymentGateway } from './gateway'
import type { PaymentOutcome, PaymentRecord } from './payment-outcome'
import { settlePolled, settleReply } from './settlement.server'
import {
  findPendingAmountInCents,
  insertPayment,
  lockTransaction,
  moveTransaction,
} from './transactions.repository.server'

const STORED_CENTS = 2700

const paid = (overrides: Partial<PaymentRecord>): PaymentRecord => ({
  amountInCents: STORED_CENTS,
  currency: 'MYR',
  message: 'Transaction Successful',
  method: 'CC',
  paidAt: null,
  providerTxnId: 'CIVtxn_abc123',
  transactionId: 'txn_abc123',
  ...overrides,
})

const pendingRow = () =>
  createFakeDb()
    .on(findPendingAmountInCents, () => STORED_CENTS)
    .on(lockTransaction, () => ({
      amountInCents: STORED_CENTS,
      createdAs: 'guest',
      status: 'pending',
      userId: 7,
    }))
    .on(moveTransaction, ({ to }) => ({ status: to }))
    .on(insertPayment, () => {})

const depsAnswering = (answer: PaymentOutcome) => {
  const db = pendingRow()
  const { events, logger } = recordingLogger()
  const base = testDeps({ db, logger })
  const queryStatus = vi.fn<PaymentGateway['queryStatus']>(() => Promise.resolve(Result.ok(answer)))
  return { db, deps: { ...base, eghl: { ...base.eghl, queryStatus } }, events }
}

const HELD_WRITES = ['payments.lockTransaction', 'payments.moveTransaction']

const MISMATCHES = [
  ['another amount', paid({ amountInCents: 9900 }), 'amount_mismatch'],
  ['another currency', paid({ currency: 'USD' }), 'currency_mismatch'],
] as const

describe('a success whose money does not match the row, on every channel', () => {
  it.each(
    MISMATCHES.flatMap(([money, record, why]) =>
      (['callback', 'return'] as const).map((source) => [source, money, record, why] as const),
    ),
  )('holds a signed %s reply with %s', async (source, _money, record, why) => {
    expect.hasAssertions()

    const { db, deps, events } = depsAnswering({ kind: 'notFound' })
    const settled = await settleReply(
      deps,
      { kind: 'settled', outcome: { card: null, kind: 'succeeded', record } },
      source,
    )

    expect(okValue(settled)).toStrictEqual({ kind: 'held', why })
    expect(db.calls.map(({ name }) => name)).toStrictEqual(HELD_WRITES)
    expect(db.calls[1]?.args).toStrictEqual([expect.objectContaining({ to: 'held' })])
    expect(events.map(({ event }) => event)).toStrictEqual([`payment.finalize.${why}`])
  })

  it.each(MISMATCHES)(
    'holds a failed claim the gateway answers as a success with %s',
    async (_money, record, why) => {
      expect.hasAssertions()

      const { db, deps } = depsAnswering({ card: null, kind: 'succeeded', record })
      const settled = await settleReply(
        deps,
        {
          claim: { kind: 'failed', record: paid({ message: 'Card declined' }) },
          kind: 'unconfirmed',
        },
        'callback',
      )

      expect(okValue(settled)).toStrictEqual({ kind: 'held', why })
      expect(db.calls.map(({ name }) => name)).toStrictEqual([
        'payments.findPendingAmountInCents',
        ...HELD_WRITES,
      ])
    },
  )

  it.each(MISMATCHES)(
    'holds a success the cron reads from the gateway with %s',
    async (_money, record, why) => {
      expect.hasAssertions()

      const { db, deps } = depsAnswering({ card: null, kind: 'succeeded', record })
      const settled = await settlePolled(deps, {
        amountInCents: STORED_CENTS,
        createdAt: new Date(),
        transactionId: 'txn_abc123',
      })

      expect(okValue(settled)).toStrictEqual({ kind: 'held', why })
      expect(db.calls.map(({ name }) => name)).toStrictEqual(HELD_WRITES)
    },
  )
})

/** One row whose status the writes change, so a test can settle it several times in order. */
const rowExpiredByTheCron = async () => {
  let status: 'failed' | 'held' | 'pending' | 'success' = 'pending'
  const db = createFakeDb()
    .on(findPendingAmountInCents, () => (status === 'pending' ? STORED_CENTS : undefined))
    .on(lockTransaction, () => ({
      amountInCents: STORED_CENTS,
      createdAs: 'guest',
      status,
      userId: 7,
    }))
    .on(moveTransaction, ({ to }) => {
      status = to
      return { status: to }
    })
    .on(insertPayment, () => {})
  const { events, logger } = recordingLogger()
  const base = testDeps({ db, logger })
  const queryStatus = vi.fn<PaymentGateway['queryStatus']>(() =>
    Promise.resolve(Result.ok({ kind: 'notFound' })),
  )
  const deps = { ...base, eghl: { ...base.eghl, queryStatus } }
  await settlePolled(deps, {
    amountInCents: STORED_CENTS,
    createdAt: new Date(Date.now() - 40 * 60_000),
    transactionId: 'txn_abc123',
  })
  const expiredAt = { calls: db.calls.length, events: events.length }
  queryStatus.mockClear()
  return {
    callsSince: () => db.calls.slice(expiredAt.calls).map(({ name }) => name),
    deps,
    eventsSince: () => events.slice(expiredAt.events),
    queryStatus,
    status: () => status,
  }
}

describe('a row the cron expired', () => {
  it.each(['callback', 'return'] as const)(
    'becomes success on a signed %s success, with its one payments row and an error alert',
    async (source) => {
      expect.hasAssertions()

      const { callsSince, deps, eventsSince, status } = await rowExpiredByTheCron()
      const expired = status()
      const settled = await settleReply(
        deps,
        { kind: 'settled', outcome: { card: null, kind: 'succeeded', record: paid({}) } },
        source,
      )

      expect(okValue(settled)).toStrictEqual({
        from: 'failed',
        kind: 'moved',
        to: 'success',
        via: 'succeeded',
      })
      expect([expired, status()]).toStrictEqual(['failed', 'success'])
      expect(callsSince()).toStrictEqual([
        'payments.lockTransaction',
        'payments.moveTransaction',
        'payments.insertPayment',
      ])
      expect(eventsSince()).toStrictEqual([
        expect.objectContaining({
          event: 'payment.finalize.late_success',
          from: 'failed',
          level: 50,
          provider_txn_id: 'CIVtxn_abc123',
          source,
        }),
      ])
    },
  )

  it('stays failed on a failed reply, without asking the gateway', async () => {
    expect.hasAssertions()

    const { callsSince, deps, queryStatus, status } = await rowExpiredByTheCron()
    const expired = status()
    const settled = await settleReply(
      deps,
      {
        claim: { kind: 'failed', record: paid({ message: 'Card declined' }) },
        kind: 'unconfirmed',
      },
      'callback',
    )

    expect(okValue(settled)).toStrictEqual({ kind: 'waiting', why: 'not_pending' })
    expect([expired, status()]).toStrictEqual(['failed', 'failed'])
    expect(queryStatus).not.toHaveBeenCalled()
    expect(callsSince()).toStrictEqual(['payments.findPendingAmountInCents'])
  })
})

describe('a held row', () => {
  it('stays held when the cron reads it as expired, should the cron ever select it', async () => {
    expect.hasAssertions()

    const db = createFakeDb()
      .on(lockTransaction, () => ({
        amountInCents: STORED_CENTS,
        createdAs: 'guest',
        status: 'held',
        userId: 7,
      }))
      .on(moveTransaction, ({ to }) => ({ status: to }))
    const base = testDeps({ db })
    const queryStatus = vi.fn<PaymentGateway['queryStatus']>(() =>
      Promise.resolve(Result.ok({ kind: 'notFound' })),
    )
    const settled = await settlePolled(
      { ...base, eghl: { ...base.eghl, queryStatus } },
      {
        amountInCents: STORED_CENTS,
        createdAt: new Date(Date.now() - 40 * 60_000),
        transactionId: 'txn_abc123',
      },
    )

    expect(okValue(settled)).toStrictEqual({ at: 'held', kind: 'absorbed', why: 'contradiction' })
    expect(db.calls.map(({ name }) => name)).toStrictEqual(['payments.lockTransaction'])
  })
})
