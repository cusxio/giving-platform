import { Result } from 'better-result'

import { assertExhaustive } from '#/core/assert-exhaustive'
import { TZDate } from '#/core/date'

import { EghlGatewayBusyError } from './eghl.errors'
import type { EghlPaymentResponse, EghlQueryResponse, Verified } from './eghl.wire'
import {
  CARD_FIELD_LENGTHS,
  EghlCardFieldsSchema,
  EghlQueryTxnStatus,
  EghlTxnExists,
  EghlTxnStatus,
} from './eghl.wire'
import type { CardUse, GatewayReply, PaymentOutcome, PaymentRecord } from './payment-outcome'

type Wire = EghlPaymentResponse | EghlQueryResponse

/**
 * The lengths of `payments.message` and `payments.payment_method`, which these fields fill. The
 * message's documented length (spec 2.2) is the same; the method's is shorter.
 */
export const TEXT_COLUMN_LENGTHS = { PymtMethod: 10, TxnMessage: 255 } as const

type TextField = keyof typeof TEXT_COLUMN_LENGTHS

type CardField = keyof typeof CARD_FIELD_LENGTHS

/** A reply or answer field cut or dropped to fit its column. */
export type ClippedField = CardField | TextField

const isCardField = (name: string): name is CardField => Object.hasOwn(CARD_FIELD_LENGTHS, name)

/** Postgres cannot store NUL, and a URL-decoded field can carry one. */
function textOf(wire: Wire, field: TextField, clipped: ClippedField[]): string {
  const raw = wire[field]
  // oxlint-disable-next-line typescript/no-misused-spread -- Postgres counts a varchar's length in code points, which is what spread yields
  const fitted = [...raw.replaceAll('\u0000', '')].slice(0, TEXT_COLUMN_LENGTHS[field]).join('')
  if (fitted !== raw) {
    clipped.push(field)
  }
  return fitted
}

const AMOUNT = /^(?<ringgit>\d+)\.(?<cents>\d{2})$/u

function centsOf(amount: string): number {
  const parts = AMOUNT.exec(amount)?.groups
  if (parts === undefined) {
    throw new Error(`eGHL amount "${amount}" is not ringgit with two decimals`)
  }
  return Number(parts.ringgit) * 100 + Number(parts.cents)
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

/**
 * A token that breaks `EghlCardFieldsSchema` drops the card. Details that break it, or are
 * missing, leave the token alone, which touches a card the donor already saved. Nothing is cut.
 */
function cardOf(wire: Wire, clipped: ClippedField[]): CardUse | null {
  const { CardExp, CardHolder, CardNoMask, CardType, Token, TokenType } = wire
  if (TokenType !== 'OCP' || Token === undefined) {
    return null
  }
  const card = { CardExp, CardHolder, CardNoMask, CardType, Token }
  const refused = new Set(
    EghlCardFieldsSchema.Errors(card)
      .map(({ instancePath }) => instancePath.slice(1))
      .filter((name) => isCardField(name)),
  )
  clipped.push(...refused)
  if (refused.has('Token')) {
    return null
  }
  if (
    refused.size > 0 ||
    CardNoMask === undefined ||
    CardExp === undefined ||
    CardType === undefined
  ) {
    return { kind: 'reused', token: Token }
  }
  return {
    card: { exp: CardExp, holder: CardHolder, mask: CardNoMask, token: Token, type: CardType },
    kind: 'saved',
  }
}

function recordOf(wire: Wire, clipped: ClippedField[]): PaymentRecord {
  return {
    amountInCents: centsOf(wire.Amount),
    currency: wire.CurrencyCode,
    message: textOf(wire, 'TxnMessage', clipped),
    method: textOf(wire, 'PymtMethod', clipped),
    paidAt: paidAtOf(wire),
    providerTxnId: wire.TxnID,
    transactionId: wire.PaymentID,
  }
}

const isDuplicatePaymentId = (message: string) =>
  message.toLowerCase().includes('duplicate payment id')

const saysCancel = (message: string) => message.toLowerCase().includes('cancel')

/** `clipped` collects the fields cut or dropped to fit their columns. */
export function replyOf(
  wire: Verified<EghlPaymentResponse>,
  clipped: ClippedField[] = [],
): GatewayReply {
  switch (wire.TxnStatus) {
    case EghlTxnStatus.Success: {
      return {
        kind: 'settled',
        outcome: {
          card: cardOf(wire, clipped),
          kind: 'succeeded',
          record: recordOf(wire, clipped),
        },
      }
    }
    case EghlTxnStatus.Failed: {
      const abandoned = wire.TxnID === '' && saysCancel(wire.TxnMessage)
      return {
        claim: { kind: abandoned ? 'cancelled' : 'failed', record: recordOf(wire, clipped) },
        kind: 'unconfirmed',
      }
    }
    case EghlTxnStatus.Pending: {
      return { kind: 'pending', record: recordOf(wire, clipped) }
    }
    default: {
      return assertExhaustive(wire.TxnStatus)
    }
  }
}

export const isUnexpectedForSale = ({ TxnStatus }: EghlQueryResponse) =>
  TxnStatus === EghlQueryTxnStatus.Authorized || TxnStatus === EghlQueryTxnStatus.Captured

function existingOutcomeOf(wire: EghlQueryResponse, clipped: ClippedField[]): PaymentOutcome {
  const record = recordOf(wire, clipped)
  const { TxnStatus } = wire
  switch (TxnStatus) {
    case EghlTxnStatus.Success: {
      return { card: cardOf(wire, clipped), kind: 'succeeded', record }
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

/** `clipped` collects the fields cut or dropped to fit their columns. */
export function outcomeOf(
  wire: Verified<EghlQueryResponse>,
  clipped: ClippedField[] = [],
): Result<PaymentOutcome, EghlGatewayBusyError> {
  switch (wire.TxnExists) {
    case EghlTxnExists.InternalError: {
      return Result.err(new EghlGatewayBusyError({ queryDesc: wire.QueryDesc }))
    }
    case EghlTxnExists.NotFound: {
      return Result.ok({ kind: 'notFound' })
    }
    case EghlTxnExists.Exists: {
      return Result.ok(existingOutcomeOf(wire, clipped))
    }
    default: {
      return assertExhaustive(wire)
    }
  }
}
