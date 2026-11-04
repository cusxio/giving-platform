import { describe, expect, it, vi } from 'vitest'

import { TRANSACTION_STATUSES } from '#/core/transaction-status'

import type * as Functions from './payments.functions'
import { receiptQuery } from './payments.queries'

vi.mock<typeof Functions>(import('./payments.functions'), () => ({}))

const pollEvery = (status: string) => {
  const { refetchInterval } = receiptQuery('T2000000000000000001')
  if (typeof refetchInterval !== 'function') {
    throw new TypeError('receiptQuery decides its refetch interval per answer')
  }
  type ReceiptQuery = Parameters<typeof refetchInterval>[0]
  return refetchInterval({
    state: { data: { transaction: { status } } },
  } as unknown as ReceiptQuery)
}

describe('the receipt query', () => {
  it('polls only while the transaction is pending', () => {
    expect.hasAssertions()

    expect(Object.fromEntries(TRANSACTION_STATUSES.map((s) => [s, pollEvery(s)]))).toStrictEqual({
      cancelled: false,
      failed: false,
      held: false,
      pending: 2000,
      success: false,
    })
  })
})
