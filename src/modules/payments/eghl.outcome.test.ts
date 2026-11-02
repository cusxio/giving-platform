import { describe, expect, it } from 'vitest'

import { TZDate } from '#/core/date'
import { errValue } from '#/server/testing/result'

import { outcomeOf, replyOf } from './eghl.outcome'
import type { EghlPaymentResponse, EghlQueryResponse } from './eghl.wire'
import { EghlQueryTxnStatus, EghlTxnExists, EghlTxnStatus } from './eghl.wire'

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

const inboundActionOf = (reply: Pick<EghlPaymentResponse, 'TxnStatus'>) =>
  ({ pending: 'leave-pending', settled: 'settle-success', unconfirmed: 'confirm-by-query' })[
    replyOf(paid(reply)).kind
  ]

const finalStatusOf = (answer: Pick<EghlQueryResponse, 'TxnExists' | 'TxnMessage' | 'TxnStatus'>) =>
  outcomeOf({ ...paid(), TransactionType: 'QUERY', ...answer } as EghlQueryResponse).match({
    err: () => null,
    ok: (outcome) =>
      ({ failed: 'failed', notFound: null, pending: null, succeeded: 'success' })[outcome.kind],
  })

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

const answered = (overrides: Partial<EghlQueryResponse>) =>
  ({
    ...paid(),
    QueryDesc: 'Exists',
    TransactionType: 'QUERY',
    TxnExists: EghlTxnExists.Exists,
    ...overrides,
  }) as EghlQueryResponse

describe('what a status query answer says', () => {
  it.each([
    [EghlTxnStatus.Success, 'Transaction Successful', 'succeeded'],
    [EghlTxnStatus.Failed, 'Transaction Failed', 'failed'],
    [EghlTxnStatus.Failed, 'Duplicate Payment ID', 'pending'],
    [EghlTxnStatus.Pending, '', 'pending'],
    [EghlQueryTxnStatus.Authorized, '', 'pending'],
    [EghlQueryTxnStatus.Captured, '', 'pending'],
    [EghlQueryTxnStatus.Refunded, '', 'pending'],
    [EghlQueryTxnStatus.Reversed, '', 'pending'],
    [EghlQueryTxnStatus.ReversalPending, '', 'pending'],
    [EghlQueryTxnStatus.NotFound, '', 'pending'],
    [EghlQueryTxnStatus.InternalError, '', 'pending'],
  ])(
    'reads an existing payment with status %s and message %j as %s',
    (TxnStatus, TxnMessage, kind) => {
      expect.hasAssertions()

      expect(outcomeOf(answered({ TxnMessage, TxnStatus })).unwrap().kind).toBe(kind)
    },
  )

  it('reads a payment the gateway never saw as not found', () => {
    expect.hasAssertions()

    expect(
      outcomeOf(
        answered({ TxnExists: EghlTxnExists.NotFound, TxnStatus: EghlQueryTxnStatus.NotFound }),
      ).unwrap(),
    ).toStrictEqual({ kind: 'notFound' })
  })

  it('reads an internal error as a busy gateway, with its description', () => {
    expect.hasAssertions()

    const busy = outcomeOf(
      answered({
        QueryDesc: 'System busy',
        TxnExists: EghlTxnExists.InternalError,
        TxnStatus: EghlQueryTxnStatus.InternalError,
      }),
    )

    expect(errValue(busy)).toMatchObject({ _tag: 'EghlGatewayBusyError', queryDesc: 'System busy' })
  })

  it('carries the card a successful answer reports', () => {
    expect.hasAssertions()

    expect(
      outcomeOf(answered({ ...newCard, TxnStatus: EghlTxnStatus.Success })).unwrap(),
    ).toMatchObject({ card: { card: { token: 'tok_new' }, kind: 'saved' }, kind: 'succeeded' })
  })
})

const failedReply = (TxnID: string, TxnMessage: string) =>
  replyOf(paid({ TxnID, TxnMessage, TxnStatus: EghlTxnStatus.Failed }))

const pendingAnswer = (TxnStatus: EghlQueryResponse['TxnStatus'], TxnMessage = '') =>
  outcomeOf({
    ...paid(),
    TransactionType: 'QUERY',
    TxnExists: EghlTxnExists.Exists,
    TxnMessage,
    TxnStatus,
  }).unwrap()

describe("a failed reply's claim", () => {
  it.each([
    ['a cancel or timeout, with no gateway transaction', '', 'Buyer cancelled', 'cancelled'],
    ['a cancel in any case, with no gateway transaction', '', 'CANCELLED BY BUYER', 'cancelled'],
    ["a repeated PaymentID's rejection", '', 'Duplicate Payment ID', 'failed'],
    ['a reworded repeated PaymentID rejection', '', 'Duplicate PaymentID', 'failed'],
    [
      'a failure that does not say cancel, with no gateway transaction',
      '',
      'Transaction Failed',
      'failed',
    ],
    ['a failure with no message and no gateway transaction', '', '', 'failed'],
    ['a decline with no gateway transaction', '', 'Card declined', 'failed'],
    ['a failure with a gateway transaction', 'CIVtxn_abc123', 'Buyer cancelled', 'failed'],
  ])('is %s', (_case, txnId, message, kind) => {
    expect.hasAssertions()

    expect(failedReply(txnId, message)).toMatchObject({ claim: { kind }, kind: 'unconfirmed' })
  })
})

describe("a pending answer's kind of pending", () => {
  it('is the gateway pending for its own pending status', () => {
    expect.hasAssertions()

    expect(pendingAnswer(EghlTxnStatus.Pending)).toMatchObject({ answer: 'gateway_pending' })
  })

  it.each([
    ['a repeated PaymentID', EghlTxnStatus.Failed, 'Duplicate Payment ID'],
    ['authorized', EghlQueryTxnStatus.Authorized, ''],
    ['captured', EghlQueryTxnStatus.Captured, ''],
    ['an internal error code', EghlQueryTxnStatus.InternalError, ''],
    ['a not-found code', EghlQueryTxnStatus.NotFound, ''],
    ['refunded', EghlQueryTxnStatus.Refunded, ''],
    ['reversal pending', EghlQueryTxnStatus.ReversalPending, ''],
    ['reversed', EghlQueryTxnStatus.Reversed, ''],
  ] as const)('is not final for %s', (_case, status, message) => {
    expect.hasAssertions()

    expect(pendingAnswer(status, message)).toMatchObject({
      answer: 'inconclusive',
      kind: 'pending',
    })
  })
})
