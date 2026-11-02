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
  | {
      /**
       * `pending` is the gateway's own pending status. `not_final` is any other answer that
       * settles nothing, such as a repeated PaymentID's rejection or an authorized sale.
       */
      readonly answer: 'not_final' | 'pending'
      readonly kind: 'pending'
      readonly record: PaymentRecord
    }

type SucceededOutcome = Extract<PaymentOutcome, { kind: 'succeeded' }>
type FailedOutcome = Extract<PaymentOutcome, { kind: 'failed' }>

/** Our own verdict for an attempt the gateway never settled: it has not heard of it for too long. */
interface ExpiredOutcome {
  readonly kind: 'expired'
  readonly transactionId: string
}

/** What `recordOutcome` writes. Each kind has a target status. */
export type Settling = ExpiredOutcome | FailedOutcome | SucceededOutcome

export const transactionIdOf = (outcome: Settling): string =>
  outcome.kind === 'expired' ? outcome.transactionId : outcome.record.transactionId

export function targetOf(outcome: Settling): Reachable {
  switch (outcome.kind) {
    case 'succeeded': {
      return 'success'
    }
    case 'failed':
    case 'expired': {
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
  return { kind: 'move', transition: new Transition(stored.status, to, transactionIdOf(outcome)) }
}

/**
 * A reply's claim that the attempt ended unpaid. `cancelled` is a page left before any bank step,
 * by a cancel or a timeout: the reply has no gateway transaction and is not a repeated PaymentID.
 */
export interface UnconfirmedClaim {
  readonly kind: 'cancelled' | 'failed'
  readonly record: PaymentRecord
}

/**
 * What a callback or return request amounts to. A reply's signature does not cover its message,
 * so only a success is `settled` by the reply alone. A reply that says the payment failed is
 * `unconfirmed` until a status query agrees, which is why `settled` cannot hold a failure.
 */
export type GatewayReply =
  | { readonly claim: UnconfirmedClaim; readonly kind: 'unconfirmed' }
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

/** How long the gateway may not know an attempt before the cron fails it. */
const EXPIRE_AFTER_MINUTES = 30

/** What a status query answer means for a row: record a settling, or wait for a later answer. */
export type Decision =
  | { readonly do: 'record'; readonly settling: Settling }
  | { readonly do: 'wait'; readonly why: 'gateway_pending' | 'not_found' }

/**
 * Who asked. A callback or return brings the reply's unconfirmed claim. The cron brings the row's
 * age in minutes, fractional, and its id, since a not-found answer carries no record.
 */
type DecisionContext =
  | { readonly ageMinutes: number; readonly transactionId: string }
  | { readonly claim: UnconfirmedClaim }

/**
 * The one place that says what a status query answer means, for the callback, the return and the
 * cron. A final answer wins over any claim. A cancelled claim settles failed, with the reply's
 * record, when the gateway still reports the attempt pending with no transaction of its own: it
 * answers that way forever for a page left before any bank step. Only the cron expires an
 * attempt, and only one the gateway has not heard of for longer than `EXPIRE_AFTER_MINUTES`.
 */
export function decide(outcome: PaymentOutcome, context: DecisionContext): Decision {
  switch (outcome.kind) {
    case 'succeeded':
    case 'failed': {
      return { do: 'record', settling: outcome }
    }
    case 'pending': {
      const abandoned =
        'claim' in context &&
        context.claim.kind === 'cancelled' &&
        outcome.answer === 'pending' &&
        outcome.record.providerTxnId === ''
      return abandoned
        ? { do: 'record', settling: { kind: 'failed', record: context.claim.record } }
        : { do: 'wait', why: 'gateway_pending' }
    }
    case 'notFound': {
      return 'ageMinutes' in context && context.ageMinutes > EXPIRE_AFTER_MINUTES
        ? { do: 'record', settling: { kind: 'expired', transactionId: context.transactionId } }
        : { do: 'wait', why: 'not_found' }
    }
    default: {
      return assertExhaustive(outcome)
    }
  }
}
