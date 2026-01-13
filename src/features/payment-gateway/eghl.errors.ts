import type { ParseError } from '#/core/errors'

export type EghlCallbackError =
  | EghlInvalidMethodError
  | EghlServerError
  | EghlVerificationError
  | ParseError

export interface EghlFetchError {
  readonly error: TypeError
  readonly type: 'EghlFetchError'
}

export interface EghlInvalidMethodError {
  readonly type: 'EghlInvalidMethodError'
}

export type EghlQueryError =
  | EghlFetchError
  | EghlQueryResponseError
  | EghlServerError
  | EghlVerificationError
  | ParseError

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
