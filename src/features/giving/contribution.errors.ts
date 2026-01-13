import type { TransactionRollbackErrorResult } from '#/core/errors'

export type CreatePendingContributionError =
  | EmailBelongsToAnotherUserError
  | GuestEmailExistsError
  | TransactionRollbackErrorResult

export interface EmailBelongsToAnotherUserError {
  readonly error: Error
  readonly type: 'EmailBelongsToAnotherUserError'
}

export interface GuestEmailExistsError {
  readonly error: Error
  readonly type: 'GuestEmailExistsError'
}
