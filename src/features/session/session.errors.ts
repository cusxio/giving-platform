import type { DBEmptyReturnErrorResult, DBQueryErrorResult, ParseError } from '#/core/errors'

export type VerificationError =
  | DBEmptyReturnErrorResult
  | DBQueryErrorResult
  | ParseError
  | SessionExpiredError
  | SessionInvalidError
  | SessionNotFoundError
  | SessionUserInactiveError

interface SessionExpiredError {
  readonly serializedCookie: string
  readonly type: 'SessionExpiredError'
}

interface SessionInvalidError {
  readonly serializedCookie: string
  readonly type: 'SessionInvalidError'
}

interface SessionNotFoundError {
  readonly serializedCookie: string
  readonly type: 'SessionNotFoundError'
}

interface SessionUserInactiveError {
  readonly serializedCookie: string
  readonly type: 'SessionUserInactiveError'
}
