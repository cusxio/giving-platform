import { assertExhaustive } from '#/core/assert-exhaustive'

interface SavedCardToken {
  readonly exp: string
  readonly holder: string | undefined
  readonly mask: string
  readonly token: string
  readonly type: string
}

/**
 * Whether a successful payment touches the donor's saved cards. `saved` has the details to
 * upsert. `reused` is a saved card's token charged again: only its last-used time moves.
 */
export type CardUse =
  | { readonly kind: 'reused'; readonly token: string }
  | { readonly card: SavedCardToken; readonly kind: 'saved' }

/** What a reply or a status query answer says about one payment attempt. */
export interface PaymentRecord {
  readonly amountInCents: number
  readonly currency: string
  readonly message: string
  readonly method: string
  /** When the gateway says it happened, or null when it did not say or the time is unreadable. */
  readonly paidAt: Date | null
  /** Empty while the gateway has no transaction behind the attempt, as on a buyer cancel. */
  readonly providerTxnId: string
  readonly transactionId: string
}

/** What the gateway reports about one payment. */
export type PaymentOutcome =
  | { readonly card: CardUse | null; readonly kind: 'succeeded'; readonly record: PaymentRecord }
  | { readonly kind: 'failed'; readonly record: PaymentRecord }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'pending'; readonly record: PaymentRecord }

type SucceededOutcome = Extract<PaymentOutcome, { kind: 'succeeded' }>
type FailedOutcome = Extract<PaymentOutcome, { kind: 'failed' }>

export type Settling = FailedOutcome | SucceededOutcome

/**
 * What a callback or return request amounts to. A reply's signature does not cover its message,
 * so only a success is `settled` by the reply alone. A reply that says the payment failed is
 * `unconfirmed` until a status query agrees, which is why `settled` cannot hold a failure.
 */
export type GatewayReply =
  | { readonly claim: FailedOutcome; readonly kind: 'unconfirmed' }
  | { readonly kind: 'pending'; readonly record: PaymentRecord }
  | { readonly kind: 'settled'; readonly outcome: SucceededOutcome }

export function replyRecord(reply: GatewayReply): PaymentRecord {
  switch (reply.kind) {
    case 'settled': {
      return reply.outcome.record
    }
    case 'unconfirmed': {
      return reply.claim.record
    }
    case 'pending': {
      return reply.record
    }
    default: {
      return assertExhaustive(reply)
    }
  }
}
