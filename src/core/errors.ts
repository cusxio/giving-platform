import type { ParseError as TypeboxParseError } from 'typebox/value'

export interface ParseError {
  readonly error: TypeboxParseError
  readonly type: 'ParseError'
}

export function createDBError(error: unknown): DBQueryErrorResult {
  return { error, type: 'DBQueryError' }
}

export function createParseError(error: unknown): ParseError {
  return { error: error as TypeboxParseError, type: 'ParseError' }
}

export interface DBEmptyReturnErrorResult {
  readonly error: DBEmptyReturnError
  readonly type: 'DBEmptyReturnError'
}

export interface DBQueryErrorResult {
  readonly error: unknown
  readonly type: 'DBQueryError'
}

export class DBEmptyReturnError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message ?? 'The database did not return the expected result', options)
    this.name = 'DBEmptyReturnError'
  }
}
