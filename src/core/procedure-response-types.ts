export type AuthErrorResponse<T = undefined> = T extends undefined
  ? { type: 'AUTH_ERROR' }
  : { message: T; type: 'AUTH_ERROR' }

export interface BusinessErrorResponse<T extends string> {
  error: { code: T; message?: string }
  type: 'BUSINESS_ERROR'
}

export interface ServerErrorResponse {
  type: 'SERVER_ERROR'
}

export type SuccessResponse<T = undefined> = T extends undefined
  ? { type: 'SUCCESS' }
  : { type: 'SUCCESS'; value: T }

export interface ValidationErrorResponse {
  errors: ValidationError[]
  type: 'VALIDATION_ERROR'
}

interface ValidationError {
  message: string
  path: string
}
