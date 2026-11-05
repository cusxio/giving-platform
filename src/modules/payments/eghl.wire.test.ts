import { describe, expect, it } from 'vitest'

import {
  EghlPaymentResponseSchema,
  EghlQueryResponseSchema,
  EghlTxnExists,
  EghlTxnStatus,
} from './eghl.wire'

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

const notFoundReply = {
  Amount: '50.00',
  AuthCode: '',
  BankRefNo: '',
  CurrencyCode: 'MYR',
  HashValue: 'hash',
  IssuingBank: '',
  OrderNumber: '',
  PaymentID: 'txn_abc123',
  PymtMethod: 'ANY',
  QueryDesc: 'Not found',
  ServiceID: 'service-123',
  TransactionType: 'QUERY',
  TxnExists: EghlTxnExists.NotFound,
  TxnID: '',
  TxnMessage: '',
  TxnStatus: '-1',
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

  it('accepts a not-found reply signed with HashValue only', () => {
    expect.hasAssertions()

    expect(EghlQueryResponseSchema.Check(notFoundReply)).toBe(true)
  })

  it('accepts an internal-error reply', () => {
    expect.hasAssertions()

    expect(
      EghlQueryResponseSchema.Check({
        ...notFoundReply,
        TxnExists: EghlTxnExists.InternalError,
        TxnStatus: '-2',
      }),
    ).toBe(true)
  })

  it.each([
    [EghlTxnExists.NotFound, EghlTxnStatus.Failed],
    [EghlTxnExists.NotFound, '-2'],
    [EghlTxnExists.InternalError, EghlTxnStatus.Success],
    [EghlTxnExists.InternalError, '-1'],
  ])('rejects TxnExists %s with TxnStatus %s', (TxnExists, TxnStatus) => {
    expect.hasAssertions()

    expect(EghlQueryResponseSchema.Check({ ...notFoundReply, TxnExists, TxnStatus })).toBe(false)
  })
})

describe('eghlPaymentResponseSchema', () => {
  it('rejects a query-only status', () => {
    expect.hasAssertions()

    expect(EghlPaymentResponseSchema.Check({ ...paymentFields, TxnStatus: '-1' })).toBe(false)
  })

  it('rejects a reply without HashValue2', () => {
    expect.hasAssertions()

    const { HashValue2: _omitted, ...withoutHashValue2 } = paymentFields

    expect(EghlPaymentResponseSchema.Check(withoutHashValue2)).toBe(false)
  })
})
