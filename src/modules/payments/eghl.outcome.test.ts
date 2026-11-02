import { describe, expect, it } from 'vitest'

import { TZDate } from '#/core/date'
import { errValue } from '#/server/testing/result'

import type { ClippedField } from './eghl.outcome'
import { outcomeOf, replyOf } from './eghl.outcome'
import type { EghlPaymentResponse, EghlQueryResponse, Verified } from './eghl.wire'
import { EghlQueryTxnStatus, EghlTxnExists, EghlTxnStatus } from './eghl.wire'
import { replyRecord } from './payment-outcome'

const paid = (overrides: Partial<EghlPaymentResponse> = {}) =>
  ({
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
  }) as Verified<EghlPaymentResponse>

const inboundActionOf = (reply: Pick<EghlPaymentResponse, 'TxnStatus'>) =>
  ({ pending: 'leave-pending', settled: 'settle-success', unconfirmed: 'confirm-by-query' })[
    replyOf(paid(reply)).kind
  ]

const finalStatusOf = (answer: Pick<EghlQueryResponse, 'TxnExists' | 'TxnMessage' | 'TxnStatus'>) =>
  outcomeOf({
    ...paid(),
    TransactionType: 'QUERY',
    ...answer,
  } as Verified<EghlQueryResponse>).match({
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

const settledOf = (wire: Verified<EghlPaymentResponse>) => {
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

  it.each(['50.5', '50', '50.000', '-1.00', ' 50.00', '1e3.00', ''])(
    'refuses %j, which the schema never lets through',
    (Amount) => {
      expect.hasAssertions()

      expect(() => replyOf(paid({ Amount }))).toThrow('is not ringgit with two decimals')
    },
  )

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
  }) as Verified<EghlQueryResponse>

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

const clippedBy = (wire: Verified<EghlPaymentResponse>) => {
  const clipped: ClippedField[] = []
  const reply = replyOf(wire, clipped)
  return { clipped, record: replyRecord(reply) }
}

describe('text that must fit its payments column', () => {
  it.each([
    ['a message at its 255-character column', { TxnMessage: 'M'.repeat(255) }, 'M'.repeat(255), []],
    ['a message one over', { TxnMessage: 'M'.repeat(256) }, 'M'.repeat(255), ['TxnMessage']],
    [
      'a message whose 255th character is an emoji',
      { TxnMessage: `${'M'.repeat(254)}😀` },
      `${'M'.repeat(254)}😀`,
      [],
    ],
    [
      'a message with an emoji one past the column',
      { TxnMessage: `${'M'.repeat(255)}😀` },
      'M'.repeat(255),
      ['TxnMessage'],
    ],
    [
      'a message with a NUL',
      { TxnMessage: 'Transaction\u0000 Successful' },
      'Transaction Successful',
      ['TxnMessage'],
    ],
  ])('keeps %s as the column can hold it', (_case, overrides, message, clipped) => {
    expect.hasAssertions()

    expect(clippedBy(paid(overrides))).toMatchObject({ clipped, record: { message } })
  })

  it.each([
    ['a method at its 10-character column', 'M'.repeat(10), 'M'.repeat(10), []],
    ['a method one over', 'M'.repeat(11), 'M'.repeat(10), ['PymtMethod']],
    ['a method with a NUL', 'C\u0000C', 'CC', ['PymtMethod']],
  ])('keeps %s as the column can hold it', (_case, PymtMethod, method, clipped) => {
    expect.hasAssertions()

    expect(clippedBy(paid({ PymtMethod }))).toMatchObject({ clipped, record: { method } })
  })

  it("fits a cancel's unsigned message, which a cancel records", () => {
    expect.hasAssertions()
    const clipped: ClippedField[] = []
    const message = `Buyer cancelled ${'x'.repeat(300)}`

    const reply = replyOf(
      paid({ TxnID: '', TxnMessage: message, TxnStatus: EghlTxnStatus.Failed }),
      clipped,
    )

    expect(reply).toMatchObject({
      claim: { kind: 'cancelled', record: { message: message.slice(0, 255) } },
      kind: 'unconfirmed',
    })
    expect(clipped).toStrictEqual(['TxnMessage'])
  })

  it('fits the message of a status query answer', () => {
    expect.hasAssertions()
    const clipped: ClippedField[] = []

    const outcome = outcomeOf(
      answered({ TxnMessage: 'F'.repeat(300), TxnStatus: EghlTxnStatus.Failed }),
      clipped,
    )

    expect(outcome.unwrap()).toMatchObject({ kind: 'failed', record: { message: 'F'.repeat(255) } })
    expect(clipped).toStrictEqual(['TxnMessage'])
  })
})

const settledCardOf = (overrides: Partial<EghlPaymentResponse>) => {
  const clipped: ClippedField[] = []
  const reply = replyOf(paid({ ...newCard, ...overrides }), clipped)
  if (reply.kind !== 'settled') {
    throw new Error(`expected a settled reply, got ${reply.kind}`)
  }
  return { card: reply.outcome.card, clipped, record: reply.outcome.record }
}

describe('a card whose fields do not fit the saved-card columns', () => {
  it.each([
    ['a token at its 50-character column', { Token: 'T'.repeat(50) }],
    ['a mask at its 19-character column', { CardNoMask: '4'.repeat(19) }],
    ['a type at its 10-character column', { CardType: 'MASTERCARD' }],
    ['a holder at its 30-character column', { CardHolder: 'H'.repeat(30) }],
    ['a holder whose 30th character is an emoji', { CardHolder: `${'H'.repeat(29)}😀` }],
    ['no holder', { CardHolder: undefined }],
  ])('saves %s', (_case, overrides) => {
    expect.hasAssertions()

    expect(settledCardOf(overrides)).toMatchObject({ card: { kind: 'saved' }, clipped: [] })
  })

  it.each([
    ['a token one over its column', { Token: 'T'.repeat(51) }],
    ['an empty token', { Token: '' }],
    ['a token with a NUL', { Token: 'tok\u0000new' }],
    [
      'a token one over, on a saved card charged again',
      { CardExp: undefined, CardNoMask: undefined, CardType: undefined, Token: 'T'.repeat(51) },
    ],
  ])('drops the card for %s, and still settles', (_case, overrides) => {
    expect.hasAssertions()

    expect(settledCardOf(overrides)).toMatchObject({
      card: null,
      clipped: ['Token'],
      record: { amountInCents: 5000, message: 'Transaction Successful' },
    })
  })

  it.each([
    ['a mask one over its column', { CardNoMask: '4'.repeat(20) }, 'CardNoMask'],
    ['an empty mask', { CardNoMask: '' }, 'CardNoMask'],
    ['a mask with a NUL', { CardNoMask: '411111\u0000******1111' }, 'CardNoMask'],
    ['an expiry of seven digits', { CardExp: '2099120' }, 'CardExp'],
    ['an expiry of five digits', { CardExp: '20991' }, 'CardExp'],
    ['an expiry that is not digits', { CardExp: '12/99X' }, 'CardExp'],
    ['a type one over its column', { CardType: 'MASTERCARDS' }, 'CardType'],
    ['an empty type', { CardType: '' }, 'CardType'],
    ['a holder one over its column', { CardHolder: 'H'.repeat(31) }, 'CardHolder'],
    [
      'a holder with an emoji one past its column',
      { CardHolder: `${'H'.repeat(30)}😀` },
      'CardHolder',
    ],
    ['a holder with a NUL', { CardHolder: 'ADA\u0000LOVELACE' }, 'CardHolder'],
  ])('keeps only the token for %s, never a cut detail', (_case, overrides, field) => {
    expect.hasAssertions()

    expect(settledCardOf(overrides)).toStrictEqual({
      card: { kind: 'reused', token: 'tok_new' },
      clipped: [field],
      record: settledOf(paid()).record,
    })
  })

  it('names every detail that does not fit', () => {
    expect.hasAssertions()

    expect(settledCardOf({ CardExp: '1299', CardHolder: 'H'.repeat(31) }).clipped).toStrictEqual([
      'CardExp',
      'CardHolder',
    ])
  })

  it('drops the card of a status query answer whose token does not fit', () => {
    expect.hasAssertions()
    const clipped: ClippedField[] = []

    const outcome = outcomeOf(
      answered({ ...newCard, Token: 'T'.repeat(51), TxnStatus: EghlTxnStatus.Success }),
      clipped,
    )

    expect(outcome.unwrap()).toMatchObject({ card: null, kind: 'succeeded' })
    expect(clipped).toStrictEqual(['Token'])
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
