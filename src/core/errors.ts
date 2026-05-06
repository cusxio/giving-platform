import type { ParseError as TypeboxParseError } from 'typebox/value'

import type { DBQueryErrorResult, TransactionRollbackErrorResult } from '../db/errors'

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

export type {
  DBEmptyReturnErrorResult,
  DBQueryErrorResult,
  TransactionRollbackErrorResult,
} from '../db/errors'
