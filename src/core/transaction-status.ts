export const TRANSACTION_STATUSES = ['pending', 'success', 'failed'] as const
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number]

/** `success` and `failed` absorb: a replay or a contradicting later reply cannot move them. */
export const TRANSITIONS = {
  failed: [],
  pending: ['success', 'failed'],
  success: [],
} as const satisfies Record<TransactionStatus, readonly TransactionStatus[]>

type Transitions = typeof TRANSITIONS

type SourcesOf<To extends TransactionStatus> = {
  [From in TransactionStatus]: To extends Transitions[From][number] ? From : never
}[TransactionStatus]

export type Reachable = {
  [S in TransactionStatus]: [SourcesOf<S>] extends [never] ? never : S
}[TransactionStatus]

export function canMove(from: TransactionStatus, to: TransactionStatus): boolean {
  const targets: readonly TransactionStatus[] = TRANSITIONS[from]
  return targets.includes(to)
}

export const sourcesOf = (to: Reachable): TransactionStatus[] =>
  TRANSACTION_STATUSES.filter((from) => canMove(from, to))

export const COUNTED_STATUS = 'success' as const satisfies TransactionStatus

const LISTED_IN_HISTORY = { failed: true, pending: false, success: true } as const satisfies Record<
  TransactionStatus,
  boolean
>

export const LISTED_STATUSES: TransactionStatus[] = TRANSACTION_STATUSES.filter(
  (status) => LISTED_IN_HISTORY[status],
)
