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

interface EghlInvalidMethodError {
  readonly type: 'EghlInvalidMethodError'
}

export type EghlQueryError =
  | EghlFetchError
  | EghlQueryMismatchError
  | EghlQueryResponseError
  | EghlServerError
  | EghlVerificationError
  | ParseError

interface EghlQueryMismatchError {
  readonly type: 'EghlQueryMismatchError'
}

interface EghlQueryResponseError {
  readonly message: string
  readonly type: 'EghlQueryResponseError'
}

interface EghlServerError {
  readonly type: 'EghlServerError'
}

interface EghlVerificationError {
  readonly type: 'EghlVerificationError'
}
