import type { ParseError as TypeboxParseError } from 'typebox/value'

import type {
  DBQueryErrorResult,
  TransactionRollbackErrorResult,
} from '../db/errors'

export interface ParseError {
  readonly error: TypeboxParseError
  readonly type: 'ParseError'
}

export function createDBError(error: unknown): DBQueryErrorResult {
  return { type: 'DBQueryError', error: error as DBQueryErrorResult['error'] }
}

export function createParseError(error: unknown): ParseError {
  return { type: 'ParseError', error: error as TypeboxParseError }
}

export function createTransactionError(
  error: unknown,
): TransactionRollbackErrorResult {
  return {
    type: 'TransactionRollbackError',
    error: error as TransactionRollbackErrorResult['error'],
  }
}

export type {
  DBEmptyReturnErrorResult,
  DBQueryErrorResult,
  TransactionRollbackErrorResult,
} from '../db/errors'
