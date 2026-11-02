import { assertExhaustive } from '#/core/assert-exhaustive'
import type { Reachable, TransactionStatus } from '#/core/transaction-status'
import { canMove } from '#/core/transaction-status'

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

export function targetOf(outcome: Settling): Reachable {
  switch (outcome.kind) {
    case 'succeeded': {
      return 'success'
    }
    case 'failed': {
      return 'failed'
    }
    default: {
      return assertExhaustive(outcome)
    }
  }
}

export interface StoredTransaction {
  readonly amountInCents: number
  readonly createdAs: 'guest' | 'user'
  readonly status: TransactionStatus
  readonly userId: number
}

/**
 * A status change the table allows. Only `planTransition` makes one: the class is exported as a
 * type alone, and its private field keeps an object literal or a spread of a real transition
 * from passing as one, so `moveTransaction` can only ever write a pair `TRANSITIONS` lists.
 */
class Transition {
  declare private readonly planned: true
  readonly from: TransactionStatus
  readonly to: Reachable
  readonly transactionId: string

  constructor(from: TransactionStatus, to: Reachable, transactionId: string) {
    this.from = from
    this.to = to
    this.transactionId = transactionId
  }
}
export type { Transition }

export type Plan =
  | {
      readonly at: TransactionStatus
      readonly kind: 'absorb'
      readonly why: 'contradiction' | 'replay'
    }
  | { readonly kind: 'move'; readonly transition: Transition }

export function planTransition(stored: StoredTransaction, outcome: Settling): Plan {
  const to = targetOf(outcome)
  if (stored.status === to) {
    return { at: stored.status, kind: 'absorb', why: 'replay' }
  }
  if (!canMove(stored.status, to)) {
    return { at: stored.status, kind: 'absorb', why: 'contradiction' }
  }
  return {
    kind: 'move',
    transition: new Transition(stored.status, to, outcome.record.transactionId),
  }
}

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
