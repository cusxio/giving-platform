import { describe, expect, it } from 'vitest'

import { TZDate } from '#/core/date'

import { finalStatusOf, inboundActionOf, replyOf } from './eghl.outcome'
import type { EghlPaymentResponse } from './eghl.wire'
import { EghlQueryTxnStatus, EghlTxnExists, EghlTxnStatus } from './eghl.wire'

describe('eGHL inbound reply action', () => {
  it('settles a successful reply directly', () => {
    expect.hasAssertions()

    expect(inboundActionOf({ TxnStatus: EghlTxnStatus.Success })).toBe('settle-success')
  })

  it('confirms a failed reply with a status query', () => {
    expect.hasAssertions()

    expect(inboundActionOf({ TxnStatus: EghlTxnStatus.Failed })).toBe('confirm-by-query')
  })

  it('leaves a pending reply pending', () => {
    expect.hasAssertions()

    expect(inboundActionOf({ TxnStatus: EghlTxnStatus.Pending })).toBe('leave-pending')
  })
})

describe('eGHL query reply finality', () => {
  const exists = { TxnExists: EghlTxnExists.Exists }

  it('settles a successful reply as success', () => {
    expect.hasAssertions()

    expect(
      finalStatusOf({
        ...exists,
        TxnMessage: 'Transaction Successful',
        TxnStatus: EghlTxnStatus.Success,
      }),
    ).toBe('success')
  })

  it('settles a failed reply as failed', () => {
    expect.hasAssertions()

    expect(
      finalStatusOf({
        ...exists,
        TxnMessage: 'Transaction Failed',
        TxnStatus: EghlTxnStatus.Failed,
      }),
    ).toBe('failed')
  })

  it('settles a buyer cancellation as failed', () => {
    expect.hasAssertions()

    expect(
      finalStatusOf({ ...exists, TxnMessage: 'Buyer cancelled', TxnStatus: EghlTxnStatus.Failed }),
    ).toBe('failed')
  })

  it('leaves a pending reply unsettled', () => {
    expect.hasAssertions()

    expect(
      finalStatusOf({
        ...exists,
        TxnMessage: 'Transaction Pending',
        TxnStatus: EghlTxnStatus.Pending,
      }),
    ).toBeNull()
  })

  it('leaves a duplicate payment id rejection unsettled', () => {
    expect.hasAssertions()

    expect(
      finalStatusOf({
        ...exists,
        TxnMessage: 'Duplicate Payment ID',
        TxnStatus: EghlTxnStatus.Failed,
      }),
    ).toBeNull()
  })

  it.each([EghlTxnExists.NotFound, EghlTxnExists.InternalError])(
    'leaves a reply unsettled when TxnExists is %s',
    (TxnExists) => {
      expect.hasAssertions()

      expect(
        finalStatusOf({
          TxnExists,
          TxnMessage: 'Transaction Failed',
          TxnStatus: EghlTxnStatus.Failed,
        }),
      ).toBeNull()
    },
  )

  it.each([
    EghlQueryTxnStatus.NotFound,
    EghlQueryTxnStatus.InternalError,
    EghlQueryTxnStatus.Refunded,
    EghlQueryTxnStatus.Reversed,
  ])('leaves query status %s unsettled', (TxnStatus) => {
    expect.hasAssertions()

    expect(finalStatusOf({ ...exists, TxnMessage: '', TxnStatus })).toBeNull()
  })
})

const paid = (overrides: Partial<EghlPaymentResponse> = {}): EghlPaymentResponse => ({
  Amount: '50.00',
  CurrencyCode: 'MYR',
  HashValue: 'hash',
  HashValue2: 'hash2',
  OrderNumber: 'txn_abc123',
  PaymentID: 'txn_abc123',
  PymtMethod: 'CC',
  RespTime: '2026-10-31 11:30:00',
  ServiceID: 'service-123',
  TransactionType: 'SALE',
  TxnID: 'CIVtxn_abc123',
  TxnMessage: 'Transaction Successful',
  TxnStatus: EghlTxnStatus.Success,
  ...overrides,
})

const newCard = {
  CardExp: '209912',
  CardHolder: 'ADA LOVELACE',
  CardNoMask: '411111******1111',
  CardType: 'VISA',
  Token: 'tok_new',
  TokenType: 'OCP',
}

const settledOf = (wire: EghlPaymentResponse) => {
  const reply = replyOf(wire)
  if (reply.kind !== 'settled') {
    throw new Error(`expected a settled reply, got ${reply.kind}`)
  }
  return reply.outcome
}

describe('what a paid reply records', () => {
  it('records the payment in domain terms', () => {
    expect.hasAssertions()

    expect(settledOf(paid()).record).toStrictEqual({
      amountInCents: 5000,
      currency: 'MYR',
      message: 'Transaction Successful',
      method: 'CC',
      paidAt: new TZDate('2026-10-31T11:30:00+08:00'),
      providerTxnId: 'CIVtxn_abc123',
      transactionId: 'txn_abc123',
    })
  })

  it.each([
    ['0.14', 14],
    ['75.50', 7550],
    ['1.10', 110],
    ['4999999.99', 499_999_999],
  ])('reads %s as %i cents', (Amount, cents) => {
    expect.hasAssertions()

    expect(settledOf(paid({ Amount })).record.amountInCents).toBe(cents)
  })

  it('takes the payment time from RespTime2 when RespTime is absent', () => {
    expect.hasAssertions()

    expect(
      settledOf(paid({ RespTime: undefined, RespTime2: '2026-10-30 08:00:00' })).record.paidAt,
    ).toStrictEqual(new TZDate('2026-10-30T08:00:00+08:00'))
  })

  it.each([
    ['the reply has no time', { RespTime: undefined }],
    ['the time does not parse', { RespTime: 'not a time' }],
  ])('has no payment time when %s', (_case, overrides) => {
    expect.hasAssertions()

    expect(settledOf(paid(overrides)).record.paidAt).toBeNull()
  })

  it('carries the details of a new one-click card', () => {
    expect.hasAssertions()

    expect(settledOf(paid(newCard)).card).toStrictEqual({
      card: {
        exp: '209912',
        holder: 'ADA LOVELACE',
        mask: '411111******1111',
        token: 'tok_new',
        type: 'VISA',
      },
      kind: 'saved',
    })
  })

  it('carries a saved card charged again by its token alone', () => {
    expect.hasAssertions()

    expect(settledOf(paid({ Token: 'tok_saved', TokenType: 'OCP' })).card).toStrictEqual({
      kind: 'reused',
      token: 'tok_saved',
    })
  })

  it.each([
    ['the token is not a one-click payment token', { ...newCard, TokenType: 'OTHER' }],
    ['there is no token', { ...newCard, Token: undefined }],
  ])('carries no card when %s', (_case, overrides) => {
    expect.hasAssertions()

    expect(settledOf(paid(overrides)).card).toBeNull()
  })
})
