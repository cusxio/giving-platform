import type {
  DBEmptyReturnErrorResult,
  DBQueryErrorResult,
} from '#/core/errors'

export type AuthLoginError =
  | DBEmptyReturnErrorResult
  | DBQueryErrorResult
  | NotExistsError

export type AuthSignUpError =
  | AlreadyExistsError
  | DBEmptyReturnErrorResult
  | DBQueryErrorResult

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

interface InvalidOtpError {
  readonly type: 'InvalidOtpError'
}

interface InvalidRequestError {
  readonly type: 'InvalidRequestError'
}

interface NotExistsError {
  readonly type: 'NotExistsError'
}
