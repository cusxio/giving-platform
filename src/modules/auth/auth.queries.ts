import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'

import { logout, requestOtp, verifyOtp } from './auth.functions'
import type { RequestOtpInput } from './request-otp.server'
import type { VerifyOtpInput } from './verify-otp.server'

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
  return useMutation({ mutationFn: (input: RequestOtpInput) => $requestOtp({ data: input }) })
}

export function useVerifyOtpMutation() {
  const $verifyOtp = useServerFn(verifyOtp)
  return useMutation({ mutationFn: (input: VerifyOtpInput) => $verifyOtp({ data: input }) })
}
