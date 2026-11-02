import { Result } from 'better-result'

import { assertExhaustive } from '#/core/assert-exhaustive'
import { TZDate } from '#/core/date'

import { EghlGatewayBusyError } from './eghl.errors'
import type { EghlPaymentResponse, EghlQueryResponse } from './eghl.wire'
import { EghlQueryTxnStatus, EghlTxnExists, EghlTxnStatus } from './eghl.wire'
import type { CardUse, GatewayReply, PaymentOutcome, PaymentRecord } from './payment-outcome'

type Wire = EghlPaymentResponse | EghlQueryResponse

function centsOf(amount: string): number {
  const [ringgit = '', cents = ''] = amount.split('.')
  return Number(ringgit) * 100 + Number(cents)
}

/** The gateway sends Malaysia time with no zone. */
function paidAtOf({ RespTime, RespTime2 }: Wire): Date | null {
  const raw = RespTime ?? RespTime2
  if (raw === undefined) {
    return null
  }
  const parsed = new TZDate(`${raw.replace(' ', 'T')}+08:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function cardOf(wire: Wire): CardUse | null {
  const { CardExp, CardHolder, CardNoMask, CardType, Token, TokenType } = wire
  if (TokenType !== 'OCP' || Token === undefined) {
    return null
  }
  if (CardNoMask === undefined || CardExp === undefined || CardType === undefined) {
    return { kind: 'reused', token: Token }
  }
  return {
    card: { exp: CardExp, holder: CardHolder, mask: CardNoMask, token: Token, type: CardType },
    kind: 'saved',
  }
}

function recordOf(wire: Wire): PaymentRecord {
  return {
    amountInCents: centsOf(wire.Amount),
    currency: wire.CurrencyCode,
    message: wire.TxnMessage,
    method: wire.PymtMethod,
    paidAt: paidAtOf(wire),
    providerTxnId: wire.TxnID,
    transactionId: wire.PaymentID,
  }
}

const isDuplicatePaymentId = (message: string) =>
  message.toLowerCase().includes('duplicate payment id')

const saysCancel = (message: string) => message.toLowerCase().includes('cancel')

export function replyOf(wire: EghlPaymentResponse): GatewayReply {
  switch (wire.TxnStatus) {
    case EghlTxnStatus.Success: {
      return {
        kind: 'settled',
        outcome: { card: cardOf(wire), kind: 'succeeded', record: recordOf(wire) },
      }
    }
    case EghlTxnStatus.Failed: {
      const abandoned = wire.TxnID === '' && saysCancel(wire.TxnMessage)
      return {
        claim: { kind: abandoned ? 'cancelled' : 'failed', record: recordOf(wire) },
        kind: 'unconfirmed',
      }
    }
    case EghlTxnStatus.Pending: {
      return { kind: 'pending', record: recordOf(wire) }
    }
    default: {
      return assertExhaustive(wire.TxnStatus)
    }
  }
}

export const isUnexpectedForSale = ({ TxnStatus }: EghlQueryResponse) =>
  TxnStatus === EghlQueryTxnStatus.Authorized || TxnStatus === EghlQueryTxnStatus.Captured

function existingOutcomeOf(wire: EghlQueryResponse): PaymentOutcome {
  const record = recordOf(wire)
  const { TxnStatus } = wire
  switch (TxnStatus) {
    case EghlTxnStatus.Success: {
      return { card: cardOf(wire), kind: 'succeeded', record }
    }
    case EghlTxnStatus.Failed: {
      // eGHL rejects a reused PaymentID (e.g. a refreshed payment page) with a failure that
      // describes the repeated request, not the original attempt.
      return isDuplicatePaymentId(record.message)
        ? { answer: 'inconclusive', kind: 'pending', record }
        : { kind: 'failed', record }
    }
    case EghlTxnStatus.Pending: {
      return { answer: 'gateway_pending', kind: 'pending', record }
    }
    case EghlQueryTxnStatus.Authorized:
    case EghlQueryTxnStatus.Captured:
    case EghlQueryTxnStatus.InternalError:
    case EghlQueryTxnStatus.NotFound:
    case EghlQueryTxnStatus.Refunded:
    case EghlQueryTxnStatus.ReversalPending:
    case EghlQueryTxnStatus.Reversed: {
      return { answer: 'inconclusive', kind: 'pending', record }
    }
    default: {
      return assertExhaustive(TxnStatus)
    }
  }
}

export function outcomeOf(wire: EghlQueryResponse): Result<PaymentOutcome, EghlGatewayBusyError> {
  switch (wire.TxnExists) {
    case EghlTxnExists.InternalError: {
      return Result.err(new EghlGatewayBusyError({ queryDesc: wire.QueryDesc }))
    }
    case EghlTxnExists.NotFound: {
      return Result.ok({ kind: 'notFound' })
    }
    case EghlTxnExists.Exists: {
      return Result.ok(existingOutcomeOf(wire))
    }
    default: {
      return assertExhaustive(wire)
    }
  }
}
