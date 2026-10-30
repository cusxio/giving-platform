import { describe, expect, it } from 'vitest'

import { EghlQueryResponseSchema, EghlTxnExists, EghlTxnStatus } from './eghl.schema'

const paymentFields = {
  Amount: '50.00',
  CurrencyCode: 'MYR',
  HashValue: 'hash',
  HashValue2: 'hash2',
  OrderNumber: 'txn_abc123',
  PaymentID: 'txn_abc123',
  PymtMethod: 'ANY',
  ServiceID: 'service-123',
  TransactionType: 'QUERY',
  TxnID: 'CIVtxn_abc123',
  TxnMessage: 'Transaction Successful',
  TxnStatus: EghlTxnStatus.Success,
}

describe('eghlQueryResponseSchema', () => {
  it('accepts a query response that carries the payment fields', () => {
    expect.hasAssertions()

    expect(
      EghlQueryResponseSchema.Check({ ...paymentFields, TxnExists: EghlTxnExists.Exists }),
    ).toBe(true)
  })

  it('rejects a query response without the payment fields', () => {
    expect.hasAssertions()

    expect(EghlQueryResponseSchema.Check({ TxnExists: EghlTxnExists.Exists })).toBe(false)
  })
})
