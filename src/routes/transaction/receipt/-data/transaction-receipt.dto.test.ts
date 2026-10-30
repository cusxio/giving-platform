import { describe, expect, it } from 'vitest'

import type { Payment, Transaction, User } from '#/db/schema'

import { toTransactionReceipt } from './transaction-receipt.dto'

const transaction: Transaction = {
  amount: 5000,
  createdAs: 'guest',
  createdAt: new Date('2026-10-01T10:00:00Z'),
  id: 'txn_abc123',
  status: 'success',
  updatedAt: new Date('2026-10-01T10:01:00Z'),
  userId: 42,
}

const failedTransaction: Transaction = { ...transaction, status: 'failed' }

const guest: User = {
  createdAt: new Date('2026-10-01T09:00:00Z'),
  email: 'guest@example.com',
  emailVerifiedAt: null,
  firstName: 'Ada',
  id: 42,
  journey: null,
  lastName: 'Lovelace',
  role: 'user',
  status: 'guest',
  updatedAt: new Date('2026-10-01T09:00:00Z'),
}

const registeredUser: User = {
  ...guest,
  emailVerifiedAt: new Date('2026-10-01T09:30:00Z'),
  status: 'active',
}

const payment: Payment = {
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
