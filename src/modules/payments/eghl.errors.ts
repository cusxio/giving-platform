import { TaggedError } from 'better-result'

/** A callback or return request that is neither a GET nor a POST. */
export class EghlInvalidMethodError extends TaggedError('EghlInvalidMethodError') {}

/** The reply's body could not be read or split into fields. */
export class EghlServerError extends TaggedError('EghlServerError') {}

/** The reply's fields do not fit its schema. */
export class ParseError extends TaggedError('ParseError')<{ cause: unknown }> {}

/** The reply's signature does not match its fields. */
export class EghlVerificationError extends TaggedError('EghlVerificationError') {}

/** The status query got no reply: the request failed or timed out, or the body broke off. */
export class EghlFetchError extends TaggedError('EghlFetchError')<{ cause: unknown }> {}

/** The gateway answered the status query with an HTTP error. */
export class EghlQueryResponseError extends TaggedError('EghlQueryResponseError') {}

/** The gateway could not look the payment up just now (an internal error). Ask again later. */
export class EghlGatewayBusyError extends TaggedError('EghlGatewayBusyError')<{
  queryDesc: string | undefined
}> {}

/** A verified status reply names another payment or amount than the one asked about. */
export class EghlQueryMismatchError extends TaggedError('EghlQueryMismatchError') {}

export type EghlReplyError =
  | EghlInvalidMethodError
  | EghlServerError
  | EghlVerificationError
  | ParseError

export type EghlQueryError =
  | EghlFetchError
  | EghlGatewayBusyError
  | EghlQueryMismatchError
  | EghlQueryResponseError
  | EghlServerError
  | EghlVerificationError
  | ParseError
