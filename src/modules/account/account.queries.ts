import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { toast } from '#/components/ui/toaster'
import { assertExhaustive } from '#/core/assert-exhaustive'
import { useSuspenseQueryDeferred } from '#/hooks/use-suspense-query-deferred'

import { getCurrentUser, getWelcome, updatePrivacyMode, updateUser } from './account.functions'
import type { UpdatePrivacyModeInput, UpdateUserInput } from './account.server'
import type { CurrentUserResponse } from './account.types'

export function currentUserQuery() {
  return queryOptions({ queryFn: () => getCurrentUser(), queryKey: ['auth-user'] })
}

export function useAuthUser() {
  const { data } = useSuspenseQueryDeferred(currentUserQuery())

  if (data.type !== 'SUCCESS') {
    throw new Error('useAuthUser must be used within a protected route')
  }

  return data.value
}

export function useOptionalAuthUser() {
  const { data } = useSuspenseQueryDeferred(currentUserQuery())
  const authUser = data.type === 'SUCCESS' ? data.value : undefined

  return authUser
}

export function welcomeQuery() {
  return queryOptions({ queryFn: () => getWelcome(), queryKey: ['welcome'] })
}

export function useUpdatePrivacyModeMutation() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: (privacyMode: UpdatePrivacyModeInput['privacyMode']) =>
      updatePrivacyMode({ data: { privacyMode } }),
    onMutate(nextPrivacyMode) {
      queryClient.setQueryData<Extract<CurrentUserResponse, { type: 'SUCCESS' }>>(
        currentUserQuery().queryKey,
        (prev) => {
          if (!prev) {
            return prev
          }
          return {
            type: prev.type,
            value: {
              ...prev.value,
              userSettings: { ...prev.value.userSettings, privacyMode: nextPrivacyMode },
            },
          }
        },
      )
    },
    async onSuccess(res) {
      switch (res.type) {
        case 'AUTH_ERROR': {
          toast.error(res.message)
          await navigate({ to: '/auth/login' })
          break
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
  return useMutation({ mutationFn: (input: UpdateUserInput) => $updateUser({ data: input }) })
}
