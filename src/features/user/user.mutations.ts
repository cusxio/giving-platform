import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { toast } from '#/components/ui/toaster'
import { assertExhaustive } from '#/core/assert-exhaustive'

import { GetUserResponse } from '../auth/auth.get-user.procedure'

import type { UpdatePrivacyModeInput } from './user.update-privacy-mode.procedure'
import { updatePrivacyMode } from './user.update-privacy-mode.procedure'
import type { UpdateUserInput } from './user.update-user.procedure'
import { updateUser } from './user.update-user.procedure'

export function useUpdatePrivacyModeMutation() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: (privacyMode: UpdatePrivacyModeInput['privacyMode']) =>
      updatePrivacyMode({ data: { privacyMode } }),
    onMutate(nextPrivacyMode) {
      queryClient.setQueryData<Extract<GetUserResponse, { type: 'SUCCESS' }>>(
        ['auth-user'],
        (prev) => {
          if (!prev) return
          return {
            value: {
              ...prev.value,
              userSettings: {
                ...prev.value.userSettings,
                privacyMode: nextPrivacyMode,
              },
            },
            type: prev.type,
          }
        },
      )
    },
    onSuccess(res) {
      switch (res.type) {
        case 'AUTH_ERROR': {
          toast.error(res.message)
          return navigate({ to: '/auth/login' })
        }
        case 'SERVER_ERROR': {
          toast.unexpected()
          break
        }
        case 'SUCCESS': {
          break
        }
        default: {
          assertExhaustive(res)
        }
      }
    },
  })
}

export function useUpdateUserMutation() {
  const $updateUser = useServerFn(updateUser)
  return useMutation({
    mutationFn: (input: UpdateUserInput) => $updateUser({ data: input }),
  })
}
