import { createServerFn } from '@tanstack/react-start'

import type { RequestOtpInput } from './request-otp.server'
import { requestOtpProcedure } from './request-otp.server'
import { logoutProcedure } from './session.server'
import type { VerifyOtpInput } from './verify-otp.server'
import { verifyOtpProcedure } from './verify-otp.server'

export const hasSession = createServerFn().handler(({ context }) => context.session !== null)

export const logout = createServerFn({ method: 'POST' }).handler(({ context }) =>
  logoutProcedure(context),
)

export const requestOtp = createServerFn({ method: 'POST' })
  .validator((input: RequestOtpInput) => input)
  .handler(({ context, data }) => requestOtpProcedure(context, data))

export const verifyOtp = createServerFn({ method: 'POST' })
  .validator((input: VerifyOtpInput) => input)
  .handler(({ context, data }) => verifyOtpProcedure(context, data))
