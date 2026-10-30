import type { DrizzleQueryError } from 'drizzle-orm'
import type { ParseError as TypeboxParseError } from 'typebox/value'

export interface ParseError {
  readonly error: TypeboxParseError
  readonly type: 'ParseError'
}

export function createDBError(error: unknown): DBQueryErrorResult {
  return { error: error as DBQueryErrorResult['error'], type: 'DBQueryError' }
}

export function createParseError(error: unknown): ParseError {
  return { error: error as TypeboxParseError, type: 'ParseError' }
}

export function createTransactionError(error: unknown): TransactionRollbackErrorResult {
  return {
    error: error as TransactionRollbackErrorResult['error'],
    type: 'TransactionRollbackError',
  }
}

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
