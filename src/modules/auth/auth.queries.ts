import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'

import { logout } from './auth.functions'

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
