import type {
  DBEmptyReturnErrorResult,
  DBQueryErrorResult,
  TransactionRollbackErrorResult,
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
  | DBQueryErrorResult
  | InvalidOtpError
  | InvalidRequestError
  | TransactionRollbackErrorResult

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
