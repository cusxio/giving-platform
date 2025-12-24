import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'

import { logout } from './auth.logout.procedure'
import type { RequestOtpInput } from './auth.request-otp.procedure'
import { requestOtp } from './auth.request-otp.procedure'
import type { VerifyOtpInput } from './auth.verify-otp.procedure'
import { verifyOtp } from './auth.verify-otp.procedure'

export function useLogoutMutation() {
  const queryClient = useQueryClient()
  const $logout = useServerFn(logout)
  return useMutation({
    mutationFn: () => $logout(),
    onSuccess() {
      queryClient.clear()
    },
  })
}

export function useRequestOtpMutation() {
  const $requestOtp = useServerFn(requestOtp)
  return useMutation({
    mutationFn: (input: RequestOtpInput) =>
      $requestOtp({
        data: { email: input.email.toLowerCase(), mode: input.mode },
      }),
  })
}

export function useVerifyOtpMutation() {
  const $verifyOtp = useServerFn(verifyOtp)
  return useMutation({
    mutationFn: (input: VerifyOtpInput) =>
      $verifyOtp({
        data: {
          email: input.email.toLowerCase(),
          mode: input.mode,
          otp: input.otp,
        },
      }),
  })
}

export type { RequestOtpResponse } from './auth.request-otp.procedure'
export type { VerifyOtpResponse } from './auth.verify-otp.procedure'
