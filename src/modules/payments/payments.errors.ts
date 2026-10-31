import { TaggedError } from 'better-result'

import type { TransactionRollbackErrorResult } from '#/core/errors'

export type CreatePendingContributionError =
  | EmailBelongsToAnotherUserErrorResult
  | GuestEmailExistsErrorResult
  | TransactionRollbackErrorResult

interface EmailBelongsToAnotherUserErrorResult {
  readonly error: EmailBelongsToAnotherUserError
  readonly type: 'EmailBelongsToAnotherUserError'
}

interface GuestEmailExistsErrorResult {
  readonly error: GuestEmailExistsError
  readonly type: 'GuestEmailExistsError'
}

export class EmailBelongsToAnotherUserError extends Error {
  constructor() {
    super('Email belongs to another user')
    this.name = 'EmailBelongsToAnotherUserError'
  }
}

export class GuestEmailExistsError extends Error {
  constructor() {
    super('Email already exists for a registered user')
    this.name = 'GuestEmailExistsError'
  }
}

/** No transaction has the id. */
export class ReceiptNotFound extends TaggedError('ReceiptNotFound')<{ transactionId: string }> {}
