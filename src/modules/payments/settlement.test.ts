import { createHash } from 'node:crypto'

import { Result } from 'better-result'
import { describe, expect, it, vi } from 'vitest'

import type { TransactionStatus } from '#/core/transaction-status'
import { createFakeDb } from '#/server/testing/fake-db'
import { recordingLogger } from '#/server/testing/recording-logger'
import { okValue } from '#/server/testing/result'
import { testDeps } from '#/server/testing/test-deps'

import type { PaymentGateway } from './gateway'
import type { PaymentOutcome, PaymentRecord } from './payment-outcome'
import { settlePolled, settleReply } from './settlement.server'
import {
  findPendingAmountInCents,
  findProviderTxnIds,
  insertPayment,
  lockTransaction,
  moveTransaction,
} from './transactions.repository.server'

const STORED_CENTS = 2700

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

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
    .on(findProviderTxnIds, () => [])
    .on(moveTransaction, ({ to }) => ({ status: to }))
    .on(insertPayment, () => {})

const depsAnswering = (answer: PaymentOutcome) => {
  const db = pendingRow()
  const { events, logger } = recordingLogger()
  const base = testDeps({ db, logger })
  const queryStatus = vi.fn<PaymentGateway['queryStatus']>(() => Promise.resolve(Result.ok(answer)))
  return { db, deps: { ...base, eghl: { ...base.eghl, queryStatus } }, events }
}

const HELD_WRITES = [
  'payments.lockTransaction',
  'payments.findProviderTxnIds',
  'payments.moveTransaction',
]

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
    expect(db.calls[2]?.args).toStrictEqual([expect.objectContaining({ to: 'held' })])
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

const SIGNED_SUCCESS = {
  kind: 'settled',
  outcome: { card: null, kind: 'succeeded', record: paid({}) },
} as const

const statefulRow = () => {
  let status: TransactionStatus = 'pending'
  const providerTxnIds: (string | null)[] = []
  const db = createFakeDb()
    .on(findPendingAmountInCents, () => (status === 'pending' ? STORED_CENTS : undefined))
    .on(lockTransaction, () => ({
      amountInCents: STORED_CENTS,
      createdAs: 'guest',
      status,
      userId: 7,
    }))
    .on(findProviderTxnIds, () => [...providerTxnIds])
    .on(moveTransaction, ({ to }) => {
      status = to
      return { status: to }
    })
    .on(insertPayment, ({ providerTransactionId }) => {
      providerTxnIds.push(providerTransactionId ?? null)
    })
  const { events, logger } = recordingLogger()
  const base = testDeps({ db, logger })
  const queryStatus = vi.fn<PaymentGateway['queryStatus']>()
  const deps = { ...base, eghl: { ...base.eghl, queryStatus } }
  let mark = { calls: 0, events: 0 }
  return {
    callsSince: () => db.calls.slice(mark.calls).map(({ name }) => name),
    deps,
    eventsSince: () => events.slice(mark.events),
    failByHand: () => {
      status = 'failed'
    },
    mark: () => {
      mark = { calls: db.calls.length, events: events.length }
      queryStatus.mockReset()
    },
    paymentRows: () => providerTxnIds.length,
    queryStatus,
    status: () => status,
  }
}

const rowExpiredByTheCron = async () => {
  const row = statefulRow()
  row.queryStatus.mockResolvedValue(Result.ok({ kind: 'notFound' }))
  await settlePolled(row.deps, {
    amountInCents: STORED_CENTS,
    createdAt: new Date(Date.now() - 40 * 60_000),
    transactionId: 'txn_abc123',
  })
  row.mark()
  return row
}

const rowTheGatewayFailed = async (providerTxnId: string) => {
  const row = statefulRow()
  const declined = paid({ message: 'Card declined', providerTxnId })
  row.queryStatus.mockResolvedValue(Result.ok({ kind: 'failed', record: declined }))
  await settleReply(
    row.deps,
    { claim: { kind: 'failed', record: declined }, kind: 'unconfirmed' },
    'callback',
  )
  row.mark()
  return row
}

const rowTheDonorLeftUnpaid = async () => {
  const row = statefulRow()
  const cancel = paid({ message: 'Buyer cancelled', providerTxnId: '' })
  row.queryStatus.mockResolvedValue(
    Result.ok({
      answer: 'gateway_pending',
      kind: 'pending',
      record: paid({ message: '', providerTxnId: '' }),
    }),
  )
  await settleReply(
    row.deps,
    { claim: { kind: 'cancelled', record: cancel }, kind: 'unconfirmed' },
    'return',
  )
  row.mark()
  return row
}

const rowFailedByHandAfterItsSuccess = async () => {
  const row = statefulRow()
  await settleReply(row.deps, SIGNED_SUCCESS, 'return')
  row.failByHand()
  row.mark()
  return row
}

const LATE_WRITES = [
  'payments.lockTransaction',
  'payments.findProviderTxnIds',
  'payments.moveTransaction',
  'payments.insertPayment',
]

describe('a row the cron expired', () => {
  it.each(['callback', 'return'] as const)(
    'becomes success on a signed %s success, with its one payments row and a warning',
    async (source) => {
      expect.hasAssertions()

      const { callsSince, deps, eventsSince, paymentRows, status } = await rowExpiredByTheCron()
      const expired = status()
      const settled = await settleReply(deps, SIGNED_SUCCESS, source)

      expect(okValue(settled)).toStrictEqual({
        from: 'failed',
        kind: 'moved',
        to: 'success',
        via: 'succeeded',
      })
      expect([expired, status(), paymentRows()]).toStrictEqual(['failed', 'success', 1])
      expect(callsSince()).toStrictEqual(LATE_WRITES)
      expect(eventsSince()).toStrictEqual([
        expect.objectContaining({
          event: 'payment.finalize.late_success',
          from: 'failed',
          level: 40,
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

describe('a row the donor left unpaid, by a cancel or a page timeout', () => {
  it("is cancelled with the reply's payments row once the gateway reports the page still open", async () => {
    expect.hasAssertions()

    const { paymentRows, status } = await rowTheDonorLeftUnpaid()

    expect([status(), paymentRows()]).toStrictEqual(['cancelled', 1])
  })

  it.each(['callback', 'return'] as const)(
    "becomes success on a signed %s success, beside the cancel's payments row, with a warning",
    async (source) => {
      expect.hasAssertions()

      const { callsSince, deps, eventsSince, paymentRows, status } = await rowTheDonorLeftUnpaid()
      const settled = await settleReply(deps, SIGNED_SUCCESS, source)

      expect(okValue(settled)).toStrictEqual({
        from: 'cancelled',
        kind: 'moved',
        to: 'success',
        via: 'succeeded',
      })
      expect([status(), paymentRows()]).toStrictEqual(['success', 2])
      expect(callsSince()).toStrictEqual(LATE_WRITES)
      expect(eventsSince()).toStrictEqual([
        expect.objectContaining({
          event: 'payment.finalize.late_success',
          from: 'cancelled',
          level: 40,
          provider_txn_id: 'CIVtxn_abc123',
          source,
        }),
      ])
    },
  )

  it('stays cancelled on another cancel, without asking the gateway', async () => {
    expect.hasAssertions()

    const { callsSince, deps, queryStatus, status } = await rowTheDonorLeftUnpaid()
    const settled = await settleReply(
      deps,
      {
        claim: {
          kind: 'cancelled',
          record: paid({ message: 'Buyer cancelled', providerTxnId: '' }),
        },
        kind: 'unconfirmed',
      },
      'return',
    )

    expect(okValue(settled)).toStrictEqual({ kind: 'waiting', why: 'not_pending' })
    expect(status()).toBe('cancelled')
    expect(queryStatus).not.toHaveBeenCalled()
    expect(callsSince()).toStrictEqual(['payments.findPendingAmountInCents'])
  })
})

const REFUND = paid({ message: 'Transaction refunded' })

async function realClientReadingSignedRefund(TotalRefundAmount: string) {
  const { events, logger } = recordingLogger()
  const { config, eghl } = testDeps({ logger })
  const fields = {
    Amount: '27.00',
    AuthCode: '',
    CurrencyCode: 'MYR',
    OrderNumber: 'txn_abc123',
    PaymentID: 'txn_abc123',
    PymtMethod: 'CC',
    QueryDesc: 'Exists',
    ServiceID: config.eghl.serviceId,
    TotalRefundAmount,
    TransactionType: 'QUERY',
    TxnExists: '0',
    TxnID: 'CIVtxn_abc123',
    TxnMessage: 'Transaction refunded',
    TxnStatus: '10',
  }
  const hashKey = [
    config.eghl.password,
    fields.TxnID,
    fields.ServiceID,
    fields.PaymentID,
    fields.TxnStatus,
    fields.Amount,
    fields.CurrencyCode,
    fields.AuthCode,
  ].join('')
  const body = new URLSearchParams({
    ...fields,
    HashValue: sha256(hashKey),
    HashValue2: sha256(hashKey + fields.OrderNumber),
  }).toString()
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() => Promise.resolve(new Response(body, { status: 200 }))),
  )
  try {
    const answer = await eghl.queryStatus({
      amountInCents: STORED_CENTS,
      transactionId: 'txn_abc123',
    })
    return { answer, events }
  } finally {
    vi.unstubAllGlobals()
  }
}

const REFUND_WARNING = {
  amount_in_cents: STORED_CENTS,
  event: 'payment.finalize.refunded',
  level: 40,
  provider_txn_id: 'CIVtxn_abc123',
  refunded_amount_in_cents: null,
  stored_amount_in_cents: STORED_CENTS,
}

const PENDING_ROW_AGED_40_MINUTES = {
  amountInCents: STORED_CENTS,
  createdAt: new Date(Date.now() - 40 * 60_000),
  transactionId: 'txn_abc123',
}

const rowTheGatewayRefunded = async () => {
  const row = statefulRow()
  row.queryStatus.mockResolvedValue(
    Result.ok({ kind: 'refunded', record: REFUND, refund: { kind: 'none' } }),
  )
  await settlePolled(row.deps, PENDING_ROW_AGED_40_MINUTES)
  row.mark()
  return row
}

describe('a pending row the gateway answers refunded or reversed', () => {
  it("is refunded by the cron, with the answer's payments row and a warning naming the money", async () => {
    expect.hasAssertions()

    const row = statefulRow()
    row.queryStatus.mockResolvedValue(
      Result.ok({ kind: 'refunded', record: REFUND, refund: { kind: 'none' } }),
    )
    const settled = await settlePolled(row.deps, PENDING_ROW_AGED_40_MINUTES)

    expect(okValue(settled)).toStrictEqual({
      from: 'pending',
      kind: 'moved',
      to: 'refunded',
      via: 'refunded',
    })
    expect([row.status(), row.paymentRows()]).toStrictEqual(['refunded', 1])
    expect(row.callsSince()).toStrictEqual(LATE_WRITES)
    expect(row.eventsSince()).toStrictEqual([
      expect.objectContaining({ event: 'eghl.cron.syncing_status' }),
      expect.objectContaining({ ...REFUND_WARNING, source: 'cron' }),
    ])
  })

  it('is refunded by the cron when the refunded total is the whole sale, and logs it', async () => {
    expect.hasAssertions()

    const row = statefulRow()
    const { answer } = await realClientReadingSignedRefund('27.00')
    row.queryStatus.mockResolvedValue(answer)
    await settlePolled(row.deps, PENDING_ROW_AGED_40_MINUTES)

    expect(row.status()).toBe('refunded')
    expect(row.eventsSince()).toContainEqual(
      expect.objectContaining({ ...REFUND_WARNING, refunded_amount_in_cents: STORED_CENTS }),
    )
  })

  it.each([
    ['13.50', 1350],
    ['27.01', 2701],
    ['13', null],
  ] as const)(
    'is held by the cron with an alert when the gateway shows %s refunded of a 27.00 sale',
    async (total, refundedCents) => {
      expect.hasAssertions()

      const row = statefulRow()
      const { answer } = await realClientReadingSignedRefund(total)
      row.queryStatus.mockResolvedValue(answer)
      const settled = await settlePolled(row.deps, PENDING_ROW_AGED_40_MINUTES)

      expect(okValue(settled)).toStrictEqual({ kind: 'held', why: 'refund_mismatch' })
      expect([row.status(), row.paymentRows()]).toStrictEqual(['held', 0])
      expect(row.callsSince()).toStrictEqual(HELD_WRITES)
      expect(row.eventsSince()).toStrictEqual([
        expect.objectContaining({ event: 'eghl.cron.syncing_status' }),
        expect.objectContaining({
          amount_in_cents: STORED_CENTS,
          event: 'payment.finalize.refund_mismatch',
          from: 'pending',
          level: 50,
          provider_txn_id: 'CIVtxn_abc123',
          refunded_amount_in_cents: refundedCents,
          source: 'cron',
          stored_amount_in_cents: STORED_CENTS,
        }),
      ])
    },
  )

  it.each(
    (['callback', 'return'] as const).flatMap((source) =>
      (['failed', 'cancelled'] as const).map((claim) => [source, claim] as const),
    ),
  )(
    'is refunded when the query confirming a %s reply that claims %s answers a refund',
    async (source, claim) => {
      expect.hasAssertions()

      const row = statefulRow()
      row.queryStatus.mockResolvedValue(
        Result.ok({ kind: 'refunded', record: REFUND, refund: { kind: 'none' } }),
      )
      const settled = await settleReply(
        row.deps,
        { claim: { kind: claim, record: paid({ message: 'Card declined' }) }, kind: 'unconfirmed' },
        source,
      )

      expect(okValue(settled)).toStrictEqual({
        from: 'pending',
        kind: 'moved',
        to: 'refunded',
        via: 'refunded',
      })
      expect([row.status(), row.paymentRows()]).toStrictEqual(['refunded', 1])
      expect(row.callsSince()).toStrictEqual(['payments.findPendingAmountInCents', ...LATE_WRITES])
      expect(row.eventsSince()).toStrictEqual([
        expect.objectContaining({ ...REFUND_WARNING, source }),
      ])
    },
  )

  it.each(
    (['callback', 'return'] as const).flatMap((source) =>
      (['failed', 'cancelled'] as const).map((claim) => [source, claim] as const),
    ),
  )(
    'is held with an alert when the query confirming a %s reply that claims %s shows a partial refund',
    async (source, claim) => {
      expect.hasAssertions()

      const row = statefulRow()
      const { answer } = await realClientReadingSignedRefund('13.50')
      row.queryStatus.mockResolvedValue(answer)
      const settled = await settleReply(
        row.deps,
        { claim: { kind: claim, record: paid({ message: 'Card declined' }) }, kind: 'unconfirmed' },
        source,
      )

      expect(okValue(settled)).toStrictEqual({ kind: 'held', why: 'refund_mismatch' })
      expect([row.status(), row.paymentRows()]).toStrictEqual(['held', 0])
      expect(row.callsSince()).toStrictEqual(['payments.findPendingAmountInCents', ...HELD_WRITES])
      expect(row.eventsSince()).toStrictEqual([
        expect.objectContaining({
          event: 'payment.finalize.refund_mismatch',
          level: 50,
          refunded_amount_in_cents: 1350,
          source,
          stored_amount_in_cents: STORED_CENTS,
        }),
      ])
    },
  )

  it.each(['callback', 'return'] as const)(
    'stays refunded on a signed %s success replayed later, writing nothing',
    async (source) => {
      expect.hasAssertions()

      const { callsSince, deps, eventsSince, paymentRows, status } = await rowTheGatewayRefunded()
      const settled = await settleReply(deps, SIGNED_SUCCESS, source)

      expect(okValue(settled)).toStrictEqual({
        at: 'refunded',
        kind: 'absorbed',
        why: 'contradiction',
      })
      expect([status(), paymentRows()]).toStrictEqual(['refunded', 1])
      expect(callsSince()).toStrictEqual([
        'payments.lockTransaction',
        'payments.findProviderTxnIds',
      ])
      expect(eventsSince()).toStrictEqual([
        expect.objectContaining({ event: 'payment.finalize.contradiction', status: 'refunded' }),
      ])
    },
  )
})

const CONFLICT_ALERT = {
  amount_in_cents: STORED_CENTS,
  event: 'payment.finalize.conflict',
  from: 'failed',
  level: 50,
  provider_txn_id: 'CIVtxn_abc123',
  stored_amount_in_cents: STORED_CENTS,
}

describe('a row the gateway failed', () => {
  it.each(['callback', 'return'] as const)(
    'is held on a signed %s success under the TxnID of the failure, with a conflict alert',
    async (source) => {
      expect.hasAssertions()

      const { callsSince, deps, eventsSince, paymentRows, status } =
        await rowTheGatewayFailed('CIVtxn_abc123')
      const settled = await settleReply(deps, SIGNED_SUCCESS, source)

      expect(okValue(settled)).toStrictEqual({ kind: 'held', why: 'conflict' })
      expect([status(), paymentRows()]).toStrictEqual(['held', 1])
      expect(callsSince()).toStrictEqual(HELD_WRITES)
      expect(eventsSince()).toStrictEqual([expect.objectContaining({ ...CONFLICT_ALERT, source })])
    },
  )

  it('becomes success on a signed success under another TxnID, with an error alert', async () => {
    expect.hasAssertions()

    const { callsSince, deps, eventsSince, paymentRows, status } =
      await rowTheGatewayFailed('CIVdeclined')
    const failed = [status(), paymentRows()]
    const settled = await settleReply(deps, SIGNED_SUCCESS, 'callback')

    expect(okValue(settled)).toMatchObject({ from: 'failed', kind: 'moved', to: 'success' })
    expect([...failed, status(), paymentRows()]).toStrictEqual(['failed', 1, 'success', 2])
    expect(callsSince()).toStrictEqual(LATE_WRITES)
    expect(eventsSince()).toStrictEqual([
      expect.objectContaining({
        event: 'payment.finalize.late_success',
        level: 50,
        provider_txn_id: 'CIVtxn_abc123',
      }),
    ])
  })
})

describe('a success row an operator marked failed by hand', () => {
  it.each(['callback', 'return'] as const)(
    'is held when the donor replays its signed success as a %s, with no second payments row',
    async (source) => {
      expect.hasAssertions()

      const { callsSince, deps, eventsSince, paymentRows, status } =
        await rowFailedByHandAfterItsSuccess()
      const settled = await settleReply(deps, SIGNED_SUCCESS, source)

      expect(okValue(settled)).toStrictEqual({ kind: 'held', why: 'conflict' })
      expect([status(), paymentRows()]).toStrictEqual(['held', 1])
      expect(callsSince()).toStrictEqual(HELD_WRITES)
      expect(eventsSince()).toStrictEqual([expect.objectContaining({ ...CONFLICT_ALERT, source })])
    },
  )

  it('absorbs a second replay once held, with no second alert', async () => {
    expect.hasAssertions()

    const row = await rowFailedByHandAfterItsSuccess()
    await settleReply(row.deps, SIGNED_SUCCESS, 'return')
    row.mark()
    const settled = await settleReply(row.deps, SIGNED_SUCCESS, 'return')

    expect(okValue(settled)).toStrictEqual({ at: 'held', kind: 'absorbed', why: 'replay' })
    expect([row.status(), row.paymentRows()]).toStrictEqual(['held', 1])
    expect(row.eventsSince()).toStrictEqual([
      expect.objectContaining({ event: 'payment.finalize.idempotent', level: 30 }),
    ])
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
      .on(findProviderTxnIds, () => [])
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
    expect(db.calls.map(({ name }) => name)).toStrictEqual([
      'payments.lockTransaction',
      'payments.findProviderTxnIds',
    ])
  })
})
