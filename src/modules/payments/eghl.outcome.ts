import { Result } from 'better-result'

import { assertExhaustive } from '#/core/assert-exhaustive'
import { TZDate } from '#/core/date'

import { EghlGatewayBusyError } from './eghl.errors'
import type { EghlPaymentResponse, EghlQueryResponse } from './eghl.wire'
import { EghlQueryTxnStatus, EghlTxnExists, EghlTxnStatus } from './eghl.wire'
import type { CardUse, GatewayReply, PaymentOutcome, PaymentRecord } from './payment-outcome'

export type EghlFinalStatus = 'failed' | 'success'

/**
 * What a callback or return reply may do on its own. Its signature covers TxnStatus but not
 * TxnMessage, so a failure is only settled after our own status query confirms it.
 */
export type EghlInboundAction = 'confirm-by-query' | 'leave-pending' | 'settle-success'

export function inboundActionOf(reply: Pick<EghlPaymentResponse, 'TxnStatus'>): EghlInboundAction {
  switch (reply.TxnStatus) {
    case EghlTxnStatus.Success: {
      return 'settle-success'
    }
    case EghlTxnStatus.Failed: {
      return 'confirm-by-query'
    }
    case EghlTxnStatus.Pending: {
      return 'leave-pending'
    }
    default: {
      return assertExhaustive(reply.TxnStatus)
    }
  }
}

type EghlQueryReplyStatus = Pick<EghlQueryResponse, 'TxnExists' | 'TxnMessage' | 'TxnStatus'>

/** Returns null when the query reply does not settle the transaction, so it stays pending. */
export function finalStatusOf(reply: EghlQueryReplyStatus): EghlFinalStatus | null {
  if (reply.TxnExists !== EghlTxnExists.Exists) {
    return null
  }

  switch (reply.TxnStatus) {
    case EghlTxnStatus.Success: {
      return 'success'
    }
    case EghlTxnStatus.Failed: {
      // eGHL rejects a reused PaymentID (e.g. a refreshed payment page) with a failure that
      // describes the repeated request, not the original attempt.
      return reply.TxnMessage.toLowerCase().includes('duplicate payment id') ? null : 'failed'
    }
    case EghlTxnStatus.Pending:
    case EghlQueryTxnStatus.Authorized:
    case EghlQueryTxnStatus.Captured:
    case EghlQueryTxnStatus.InternalError:
    case EghlQueryTxnStatus.NotFound:
    case EghlQueryTxnStatus.Refunded:
    case EghlQueryTxnStatus.ReversalPending:
    case EghlQueryTxnStatus.Reversed: {
      return null
    }
    default: {
      return assertExhaustive(reply.TxnStatus)
    }
  }
}

type Wire = EghlPaymentResponse | EghlQueryResponse

/** "30.00" to 3000. The schema guarantees digits, a dot and two digits, so no float is involved. */
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

/** The one-click card a paid reply carries: its full details, or only the token charged again. */
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

/** A verified callback or return reply. */
export function replyOf(wire: EghlPaymentResponse): GatewayReply {
  switch (wire.TxnStatus) {
    case EghlTxnStatus.Success: {
      return {
        kind: 'settled',
        outcome: { card: cardOf(wire), kind: 'succeeded', record: recordOf(wire) },
      }
    }
    case EghlTxnStatus.Failed: {
      return { claim: { kind: 'failed', record: recordOf(wire) }, kind: 'unconfirmed' }
    }
    case EghlTxnStatus.Pending: {
      return { kind: 'pending', record: recordOf(wire) }
    }
    default: {
      return assertExhaustive(wire.TxnStatus)
    }
  }
}

/** Authorized and captured are statuses a sale never reaches. */
export const isUnexpectedForSale = ({ TxnStatus }: EghlQueryResponse) =>
  TxnStatus === EghlQueryTxnStatus.Authorized || TxnStatus === EghlQueryTxnStatus.Captured

const isDuplicatePaymentId = (message: string) =>
  message.toLowerCase().includes('duplicate payment id')

function existingOutcomeOf(wire: EghlQueryResponse): PaymentOutcome {
  const record = recordOf(wire)
  // A const, so the default branch narrows the status and not the whole answer to never.
  const { TxnStatus } = wire
  switch (TxnStatus) {
    case EghlTxnStatus.Success: {
      return { card: cardOf(wire), kind: 'succeeded', record }
    }
    case EghlTxnStatus.Failed: {
      // eGHL rejects a reused PaymentID (e.g. a refreshed payment page) with a failure that
      // describes the repeated request, not the original attempt.
      return isDuplicatePaymentId(record.message)
        ? { kind: 'pending', record }
        : { kind: 'failed', record }
    }
    case EghlTxnStatus.Pending:
    case EghlQueryTxnStatus.Authorized:
    case EghlQueryTxnStatus.Captured:
    case EghlQueryTxnStatus.InternalError:
    case EghlQueryTxnStatus.NotFound:
    case EghlQueryTxnStatus.Refunded:
    case EghlQueryTxnStatus.ReversalPending:
    case EghlQueryTxnStatus.Reversed: {
      return { kind: 'pending', record }
    }
    default: {
      return assertExhaustive(TxnStatus)
    }
  }
}

/**
 * A verified status query answer that names the payment and amount asked about. An internal
 * error says nothing about the payment, so it is an error to retry later.
 */
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
