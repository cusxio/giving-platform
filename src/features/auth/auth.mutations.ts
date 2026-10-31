import { useMutation } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'

import type { RequestOtpInput } from './auth.request-otp.procedure'
import { requestOtp } from './auth.request-otp.procedure'
import type { VerifyOtpInput } from './auth.verify-otp.procedure'
import { verifyOtp } from './auth.verify-otp.procedure'

export function useRequestOtpMutation() {
  const $requestOtp = useServerFn(requestOtp)
  return useMutation({ mutationFn: (input: RequestOtpInput) => $requestOtp({ data: input }) })
}

export function useVerifyOtpMutation() {
  const $verifyOtp = useServerFn(verifyOtp)
  return useMutation({ mutationFn: (input: VerifyOtpInput) => $verifyOtp({ data: input }) })
}

export type { RequestOtpResponse } from './auth.request-otp.procedure'
export type { VerifyOtpResponse } from './auth.verify-otp.procedure'
