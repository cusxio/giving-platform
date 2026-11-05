import { isNotFound } from '@tanstack/react-router'
import { pino } from 'pino'
import { describe, expect, it } from 'vitest'

import { createFakeDb } from '#/server/testing/fake-db'
import { testDeps } from '#/server/testing/test-deps'

import { toTransactionReceipt } from './receipt'
import { getReceiptProcedure, loadReceipt } from './receipt.server'
import { findReceipt } from './transactions.repository.server'

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

    await expect(loadReceipt({ db }, 'txn_abc123')).resolves.toStrictEqual({
      payment: { message: 'Buyer cancelled' },
      transaction: { id: 'txn_abc123', status: 'success' },
      user: { email: 'guest@example.com', firstName: 'Ada', status: 'guest' },
    })
    expect(db.calls).toStrictEqual([{ args: ['txn_abc123'], name: 'payments.findReceipt' }])
  })

  it('is not found when no transaction has the id, and says so in the log', async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(findReceipt, () => null)
    const events: unknown[] = []
    const logger = pino(
      { level: 'debug' },
      {
        write: (line: string) => {
          events.push(JSON.parse(line))
        },
      },
    )

    await expect(
      getReceiptProcedure({ deps: testDeps({ db, logger }) }, { transactionId: 'txn_gone' }),
    ).rejects.toSatisfy(isNotFound)
    expect(events).toMatchObject([
      { event: 'transaction.receipt.not_found', level: 40, transaction_id: 'txn_gone' },
    ])
  })
})
