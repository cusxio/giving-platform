import type { ParseError } from '#/core/errors'

export type EghlCallbackError =
  | EghlInvalidMethodError
  | EghlServerError
  | EghlVerificationError
  | ParseError

export interface EghlFetchError {
  readonly error: unknown
  readonly type: 'EghlFetchError'
}

export interface EghlInvalidMethodError {
  readonly type: 'EghlInvalidMethodError'
}

export type EghlQueryError =
  | EghlFetchError
  | EghlQueryMismatchError
  | EghlQueryResponseError
  | EghlServerError
  | EghlVerificationError
  | ParseError

export interface EghlQueryMismatchError {
  readonly type: 'EghlQueryMismatchError'
}

export interface EghlQueryResponseError {
  readonly message: string
  readonly type: 'EghlQueryResponseError'
}

export interface EghlServerError {
  readonly type: 'EghlServerError'
}

export interface EghlVerificationError {
  readonly type: 'EghlVerificationError'
}
