import type { DBEmptyReturnErrorResult, DBQueryErrorResult, ParseError } from '#/core/errors'

export type VerificationError =
  | DBEmptyReturnErrorResult
  | DBQueryErrorResult
  | ParseError
  | SessionExpiredError
  | SessionInvalidError
  | SessionNotFoundError
// | DBError
// | ExpiredError
// | InvalidSessionError
// | NotFoundError

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

// Interface DBError {
//   Error: DBEmptyReturnError | DBQueryError
//   Type: 'DATABASE_ERROR'
// }
//
// Interface ExpiredError {
//   Type: 'SESSION_EXPIRED'
// }
//
// Interface InvalidSessionError {
//   Cookie: string
//   Type: 'INVALID_SESSION'
// }
//
// Interface NotFoundError {
//   Type: 'SESSION_NOT_FOUND'
// }
