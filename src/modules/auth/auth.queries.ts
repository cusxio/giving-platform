import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { logout, requestOtp, verifyOtp } from './auth.functions'
import type { RequestOtpInput, RequestOtpResponse } from './request-otp.server'
import type { VerifyOtpInput, VerifyOtpResponse } from './verify-otp.server'

/** Drops what the tab holds for the previous user: cached queries and cached route data. */
function useForgetUser() {
  const queryClient = useQueryClient()
  const router = useRouter()
  return () => {
    queryClient.clear()
    router.clearCache()
  }
}

export function useLogoutMutation() {
  const forgetUser = useForgetUser()
  const $logout = useServerFn(logout)
  return useMutation({
    mutationFn: () => $logout(),
    onSuccess() {
      forgetUser()
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
  const forgetUser = useForgetUser()
  const $verifyOtp = useServerFn(verifyOtp)
  return useMutation({
    mutationFn: (input: VerifyOtpInput): Answer<VerifyOtpResponse> => $verifyOtp({ data: input }),
    onSuccess(res) {
      if (res?.type === 'SUCCESS') {
        forgetUser()
      }
    },
  })
}
