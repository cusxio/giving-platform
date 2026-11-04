export const TRANSACTION_STATUSES = [
  'pending',
  'success',
  'failed',
  'held',
  'cancelled',
  'refunded',
] as const
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number]

export const TRANSITIONS = {
  cancelled: ['success', 'held'],
  failed: ['success', 'held'],
  held: [],
  pending: ['success', 'failed', 'held', 'cancelled', 'refunded'],
  refunded: [],
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

const LISTED_IN_HISTORY = {
  cancelled: true,
  failed: true,
  held: false,
  pending: false,
  refunded: true,
  success: true,
} as const satisfies Record<TransactionStatus, boolean>

export const LISTED_STATUSES: TransactionStatus[] = TRANSACTION_STATUSES.filter(
  (status) => LISTED_IN_HISTORY[status],
)
