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
      readonly answer: 'gateway_pending' | 'inconclusive'
      readonly kind: 'pending'
      readonly record: PaymentRecord
    }

type SucceededOutcome = Extract<PaymentOutcome, { kind: 'succeeded' }>
type FailedOutcome = Extract<PaymentOutcome, { kind: 'failed' }>

interface ExpiredOutcome {
  readonly kind: 'expired'
  readonly transactionId: string
}

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

export const PAYMENT_CURRENCY = 'MYR'

export interface StoredTransaction {
  readonly amountInCents: number
  readonly createdAs: 'guest' | 'user'
  readonly status: TransactionStatus
  readonly userId: number
}

/**
 * The private field makes TypeScript compare `Transition` nominally, so neither an object literal
 * nor a spread of a real transition passes as one.
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
    Object.freeze(this)
  }
}
export type { Transition }

export type HoldReason = 'amount_mismatch' | 'currency_mismatch'

export type Plan =
  | {
      readonly at: TransactionStatus
      readonly kind: 'absorb'
      readonly why: 'contradiction' | 'replay'
    }
  | {
      readonly kind: 'hold'
      readonly received: PaymentRecord
      readonly transition: Transition
      readonly why: HoldReason
    }
  | { readonly kind: 'move'; readonly transition: Transition }

interface MoneyMismatch {
  readonly received: PaymentRecord
  readonly why: HoldReason
}

function moneyMismatchOf(stored: StoredTransaction, outcome: Settling): MoneyMismatch | null {
  if (outcome.kind !== 'succeeded') {
    return null
  }
  const { record } = outcome
  if (record.currency !== PAYMENT_CURRENCY) {
    return { received: record, why: 'currency_mismatch' }
  }
  return record.amountInCents === stored.amountInCents
    ? null
    : { received: record, why: 'amount_mismatch' }
}

/**
 * A success for other money than the row's goes to `held` instead of `success`. A success onto a
 * `success` row is a replay whatever its money, and so is a success for other money onto `held`.
 */
export function planTransition(stored: StoredTransaction, outcome: Settling): Plan {
  const reported = targetOf(outcome)
  const mismatch = moneyMismatchOf(stored, outcome)
  const to = mismatch === null ? reported : 'held'
  if (stored.status === reported || stored.status === to) {
    return { at: stored.status, kind: 'absorb', why: 'replay' }
  }
  if (!canMove(stored.status, to)) {
    return { at: stored.status, kind: 'absorb', why: 'contradiction' }
  }
  const transition = new Transition(stored.status, to, transactionIdOf(outcome))
  return mismatch === null
    ? { kind: 'move', transition }
    : { kind: 'hold', ...mismatch, transition }
}

/** `cancelled` is a page left before any bank step, by a cancel or a timeout. */
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

const EXPIRE_AFTER_MINUTES = 30

export type Decision =
  | { readonly do: 'record'; readonly settling: Settling }
  | { readonly do: 'wait'; readonly why: 'gateway_pending' | 'not_found' }

type DecisionContext =
  | { readonly ageMinutes: number; readonly transactionId: string }
  | { readonly claim: UnconfirmedClaim }

/**
 * A cancelled claim settles failed, with the reply's record, when the gateway still reports the
 * attempt pending with no transaction of its own: it answers that way forever for a page left
 * before any bank step.
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
        outcome.answer === 'gateway_pending' &&
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
