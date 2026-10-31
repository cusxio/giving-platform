import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'

import { logout, requestOtp, verifyOtp } from './auth.functions'
import type { RequestOtpInput, RequestOtpResponse } from './request-otp.server'
import type { VerifyOtpInput, VerifyOtpResponse } from './verify-otp.server'

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

/** A signed-in caller is redirected home, and `useServerFn` resolves undefined after the redirect. */
type Answer<T> = Promise<T | undefined>

export function useRequestOtpMutation() {
  const $requestOtp = useServerFn(requestOtp)
  return useMutation({
    mutationFn: (input: RequestOtpInput): Answer<RequestOtpResponse> =>
      $requestOtp({ data: input }),
  })
}

export function useVerifyOtpMutation() {
  const $verifyOtp = useServerFn(verifyOtp)
  return useMutation({
    mutationFn: (input: VerifyOtpInput): Answer<VerifyOtpResponse> => $verifyOtp({ data: input }),
  })
}
