import type { DrizzleQueryError } from 'drizzle-orm'

export interface DBEmptyReturnErrorResult {
  readonly error: DBEmptyReturnError
  readonly type: 'DBEmptyReturnError'
}

export interface DBQueryErrorResult {
  readonly error: DrizzleQueryError
  readonly type: 'DBQueryError'
}

export interface TransactionRollbackErrorResult {
  readonly error: TransactionRollbackError
  readonly type: 'TransactionRollbackError'
}

export class DBEmptyReturnError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message ?? 'The database did not return the expected result', options)
    this.name = 'DBEmptyReturnError'
  }
}

export class TransactionRollbackError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'TransactionRollbackError'
  }
}
