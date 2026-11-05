import type { DBEmptyReturnErrorResult, DBQueryErrorResult, ParseError } from '#/core/errors'

export type AuthLoginError = DBEmptyReturnErrorResult | DBQueryErrorResult | NotExistsError

export type AuthSignUpError =
  | AlreadyExistsError
  | DBEmptyReturnErrorResult
  | DBQueryErrorResult
  | InactiveAccountError

export type AuthValidateOtpError =
  | DBEmptyReturnErrorResult
  | DBQueryErrorResult
  | InvalidOtpError
  | InvalidRequestError

export interface RateLimitExceededError {
  readonly retryAfterSeconds: number
  readonly type: 'RateLimitExceededError'
}

interface AlreadyExistsError {
  readonly type: 'AlreadyExistsError'
}

interface InactiveAccountError {
  readonly type: 'InactiveAccountError'
}

interface InvalidOtpError {
  readonly type: 'InvalidOtpError'
}

interface InvalidRequestError {
  readonly type: 'InvalidRequestError'
}

interface NotExistsError {
  readonly type: 'NotExistsError'
}

export interface SendEmailError {
  readonly error: unknown
  readonly type: 'SendEmailError'
}

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
