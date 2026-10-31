import { TaggedError } from 'better-result'

/** Too many attempts in the window. */
export class RateLimitExceededError extends TaggedError('RateLimitExceededError')<{
  retryAfterSeconds: number
}> {}

/** A signup for an email whose account is already active. */
export class AlreadyExistsError extends TaggedError('AlreadyExistsError') {}

/** A login for an email with no active account. */
export class NotExistsError extends TaggedError('NotExistsError') {}

/** The code does not match the newest one issued. */
export class InvalidOtpError extends TaggedError('InvalidOtpError') {}

/**
 * No usable code: none issued, expired, already claimed, issued for the other mode, or held by an
 * account that may not use it.
 */
export class InvalidRequestError extends TaggedError('InvalidRequestError') {}

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
