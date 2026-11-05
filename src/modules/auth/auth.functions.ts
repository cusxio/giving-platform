import { createServerFn } from '@tanstack/react-start'

import { wireInput } from '#/core/wire'

import type { RequestOtpInput } from './request-otp.server'
import { requestOtpAction } from './request-otp.server'
import { hasSessionAction, logoutAction } from './session.server'
import type { VerifyOtpInput } from './verify-otp.server'
import { verifyOtpAction } from './verify-otp.server'

export const hasSession = createServerFn()
  .validator(wireInput<undefined>())
  .handler((ctx) => hasSessionAction(ctx))

export const logout = createServerFn({ method: 'POST' })
  .validator(wireInput<undefined>())
  .handler((ctx) => logoutAction(ctx))

export const requestOtp = createServerFn({ method: 'POST' })
  .validator(wireInput<RequestOtpInput>())
  .handler((ctx) => requestOtpAction(ctx))

export const verifyOtp = createServerFn({ method: 'POST' })
  .validator(wireInput<VerifyOtpInput>())
  .handler((ctx) => verifyOtpAction(ctx))
