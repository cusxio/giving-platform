import { TaggedError } from 'better-result'

import type { DBEmptyReturnErrorResult, DBQueryErrorResult } from '#/core/errors'

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

/** The cookie is not `<sessionId>.<rawToken>` with two 21-character parts. */
export class ParseError extends TaggedError('ParseError')<{ cause: unknown }> {}

/** No session has the cookie's id. */
export class SessionNotFoundError extends TaggedError('SessionNotFoundError') {}

/** The cookie's token does not hash to the session's. */
export class SessionInvalidError extends TaggedError('SessionInvalidError') {}

/** The session's user is no longer active. */
export class SessionUserInactiveError extends TaggedError('SessionUserInactiveError') {}

export class SessionExpiredError extends TaggedError('SessionExpiredError') {}

/** Why a session cookie does not sign the request in. Each one clears the cookie. */
export type SessionRejection =
  | ParseError
  | SessionExpiredError
  | SessionInvalidError
  | SessionNotFoundError
  | SessionUserInactiveError
