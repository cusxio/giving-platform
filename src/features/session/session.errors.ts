import type {
  DBEmptyReturnErrorResult,
  DBQueryErrorResult,
  ParseError,
} from '#/core/errors'

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

// interface DBError {
//   error: DBEmptyReturnError | DBQueryError
//   type: 'DATABASE_ERROR'
// }
//
// interface ExpiredError {
//   type: 'SESSION_EXPIRED'
// }
//
// interface InvalidSessionError {
//   cookie: string
//   type: 'INVALID_SESSION'
// }
//
// interface NotFoundError {
//   type: 'SESSION_NOT_FOUND'
// }
