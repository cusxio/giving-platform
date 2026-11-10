import { isNotFound } from '@tanstack/react-router'
import { describe, expect, expectTypeOf, it } from 'vitest'

import { createFakeDb } from '#/server/testing/fake-db'
import { recordingLogger } from '#/server/testing/recording-logger'
import { errValue, okValue } from '#/server/testing/result'
import { MEMBER, testContext } from '#/server/testing/test-context'

import { ReceiptNotFound } from './payments.errors'
import type { getReceipt } from './payments.functions'
import type { TransactionReceipt } from './receipt'
import { toTransactionReceipt } from './receipt'
import { getReceiptAction, loadReceipt } from './receipt.server'
import { findReceipt } from './transactions.repository.server'

const WARN = 40
const ERROR = 50

function fail(): never {
  throw new Error('connection terminated')
}

const transaction = {
  amount: 5000,
  createdAs: 'guest',
  createdAt: new Date('2026-10-01T10:00:00Z'),
  id: 'txn_abc123',
  status: 'success' as const,
  updatedAt: new Date('2026-10-01T10:01:00Z'),
  userId: 42,
}

const failedTransaction = { ...transaction, status: 'failed' as const }

const guest = {
  createdAt: new Date('2026-10-01T09:00:00Z'),
  email: 'guest@example.com',
  emailVerifiedAt: null,
  firstName: 'Ada',
  id: 42,
  journey: null,
  lastName: 'Lovelace',
  role: 'user',
  status: 'guest' as const,
  updatedAt: new Date('2026-10-01T09:00:00Z'),
}

const registeredUser = {
  ...guest,
  emailVerifiedAt: new Date('2026-10-01T09:30:00Z'),
  status: 'active' as const,
}

const payment = {
  createdAt: new Date('2026-10-01T10:01:00Z'),
  id: 7,
  message: 'Buyer cancelled',
  paidAt: new Date('2026-10-01T10:01:00Z'),
  paymentMethod: 'CC',
  provider: 'eghl',
  providerTransactionId: 'CIVtxn_abc123',
  transactionId: 'txn_abc123',
  updatedAt: new Date('2026-10-01T10:01:00Z'),
}

describe('transaction receipt', () => {
  it('gives a guest only the fields the receipt renders, including the email for sign-up', () => {
    expect.hasAssertions()

    expect(toTransactionReceipt({ payment: null, transaction, user: guest })).toStrictEqual({
      payment: null,
      transaction: { id: 'txn_abc123', status: 'success' },
      user: { email: 'guest@example.com', firstName: 'Ada', status: 'guest' },
    })
  })

  it('leaves out the email of a registered user', () => {
    expect.hasAssertions()

    expect(
      toTransactionReceipt({ payment: null, transaction, user: registeredUser }),
    ).toStrictEqual({
      payment: null,
      transaction: { id: 'txn_abc123', status: 'success' },
      user: { firstName: 'Ada', status: 'active' },
    })
  })

  it('keeps only the payment message of a failed payment', () => {
    expect.hasAssertions()

    expect(
      toTransactionReceipt({ payment, transaction: failedTransaction, user: guest }),
    ).toStrictEqual({
      payment: { message: 'Buyer cancelled' },
      transaction: { id: 'txn_abc123', status: 'failed' },
      user: { email: 'guest@example.com', firstName: 'Ada', status: 'guest' },
    })
  })
})

describe('reading a receipt', () => {
  it('maps the row of the given transaction', async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(findReceipt, () => ({ payment, transaction, user: guest }))

    expect(okValue(await loadReceipt({ db }, 'txn_abc123'))).toStrictEqual({
      payment: { message: 'Buyer cancelled' },
      transaction: { id: 'txn_abc123', status: 'success' },
      user: { email: 'guest@example.com', firstName: 'Ada', status: 'guest' },
    })
    expect(db.calls).toStrictEqual([{ args: ['txn_abc123'], name: 'payments.findReceipt' }])
  })

  it('is ReceiptNotFound when no transaction has the id', async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(findReceipt, () => null)

    const error = errValue(await loadReceipt({ db }, 'txn_gone'))
    expect(error).toBeInstanceOf(ReceiptNotFound)
    expect(error).toMatchObject({ transactionId: 'txn_gone' })
  })

  it('answers the receipt to anyone holding the id, signed in or not', async () => {
    expect.hasAssertions()

    expectTypeOf<Awaited<ReturnType<typeof getReceipt>>>().toEqualTypeOf<
      TransactionReceipt<'cancelled' | 'failed' | 'held' | 'pending' | 'refunded' | 'success'>
    >()
    const db = createFakeDb().on(findReceipt, () => ({ payment: null, transaction, user: guest }))
    const expected = {
      payment: null,
      transaction: { id: 'txn_abc123', status: 'success' },
      user: { email: 'guest@example.com', firstName: 'Ada', status: 'guest' },
    }

    for (const viewer of [null, MEMBER]) {
      // oxlint-disable-next-line no-await-in-loop -- one call per viewer
      const receipt = await getReceiptAction({
        context: testContext(viewer, { db }),
        data: { transactionId: 'txn_abc123' },
      })
      expect(receipt).toStrictEqual(expected)
    }
  })

  it('is not found when no transaction has the id, and says so in the log', async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(findReceipt, () => null)
    const { events, logger } = recordingLogger()

    await expect(
      getReceiptAction({
        context: testContext(null, { db, logger }),
        data: { transactionId: 'txn_gone' },
      }),
    ).rejects.toSatisfy(isNotFound)
    expect(events).toMatchObject([
      {
        event: 'transaction.receipt.not_found',
        level: WARN,
        msg: 'Receipt not found',
        transaction_id: 'txn_gone',
      },
    ])
  })

  it('throws a generic error for an id that is not a string, without a query', async () => {
    expect.hasAssertions()

    const db = createFakeDb()
    const { events, logger } = recordingLogger()

    await expect(
      getReceiptAction({ context: testContext(null, { db, logger }), data: { transactionId: 7 } }),
    ).rejects.toThrow(new Error('Invalid input'))
    expect(db.calls).toStrictEqual([])
    expect(events).toMatchObject([{ event: 'transaction.receipt.validation_failed', level: WARN }])
  })

  it('logs a failed read once and throws a generic error', async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(findReceipt, fail)
    const { events, logger } = recordingLogger()

    await expect(
      getReceiptAction({
        context: testContext(null, { db, logger }),
        data: { transactionId: 'txn_abc123' },
      }),
    ).rejects.toThrow(new Error('Internal Server Error'))
    expect(events).toMatchObject([
      { event: 'transaction.receipt.failed', level: ERROR, op: findReceipt.queryName },
    ])
  })
})
