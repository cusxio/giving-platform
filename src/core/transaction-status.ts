export const TRANSACTION_STATUSES = ['pending', 'success', 'failed'] as const
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number]

/**
 * The state machine. `TRANSITIONS[from]` lists every status a row may move to. `success` and
 * `failed` absorb: a replay or a contradicting later reply cannot move them. Nothing moves a row
 * back to `pending`.
 */
export const TRANSITIONS = {
  failed: [],
  pending: ['success', 'failed'],
  success: [],
} as const satisfies Record<TransactionStatus, readonly TransactionStatus[]>

type Transitions = typeof TRANSITIONS

/** Every status with an edge into `To`, read off the table's types. */
export type SourcesOf<To extends TransactionStatus> = {
  [From in TransactionStatus]: To extends Transitions[From][number] ? From : never
}[TransactionStatus]

/** The statuses a transition can end in. `pending` is not one of them. */
export type Reachable = {
  [S in TransactionStatus]: [SourcesOf<S>] extends [never] ? never : S
}[TransactionStatus]

export function canMove(from: TransactionStatus, to: TransactionStatus): boolean {
  const targets: readonly TransactionStatus[] = TRANSITIONS[from]
  return targets.includes(to)
}

/**
 * The statuses a compare-and-set into `to` may start from, in vocabulary order. `Reachable`
 * guarantees at least one.
 */
export function sourcesOf(to: Reachable): [TransactionStatus, ...TransactionStatus[]] {
  const [first, ...rest] = TRANSACTION_STATUSES.filter((from) => canMove(from, to))
  if (first === undefined) {
    throw new Error(`no status moves to ${to}`)
  }
  return [first, ...rest]
}

/** The only status that counts toward giving totals. */
export const COUNTED_STATUS = 'success' as const satisfies TransactionStatus

/** Which statuses a donor's history lists. A new status fails typecheck until it is decided here. */
export const LISTED_IN_HISTORY = {
  failed: true,
  pending: false,
  success: true,
} as const satisfies Record<TransactionStatus, boolean>

export const LISTED_STATUSES: TransactionStatus[] = TRANSACTION_STATUSES.filter(
  (status) => LISTED_IN_HISTORY[status],
)
