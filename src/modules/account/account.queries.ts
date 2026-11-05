import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { toast } from '#/components/ui/toaster'
import { assertExhaustive } from '#/core/assert-exhaustive'
import { useSuspenseQueryDeferred } from '#/hooks/use-suspense-query-deferred'

import { getCurrentUser, getWelcome, updatePrivacyMode, updateUser } from './account.functions'
import type { UpdatePrivacyModeInput, UpdateUserInput } from './account.server'
import type { CurrentUserResponse } from './account.types'

export function currentUserQuery() {
  return queryOptions({
    // A failed query is not cached, so the next load retries, and a failed refetch keeps the user.
    async queryFn() {
      const res = await getCurrentUser()
      if (res.type === 'SERVER_ERROR') {
        throw new Error('Could not load the current user')
      }
      return res
    },
    queryKey: ['auth-user'],
  })
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
    async onMutate(nextPrivacyMode) {
      // A user refetch already in flight (e.g. on window focus) would land after this and undo it
      await queryClient.cancelQueries({ queryKey: currentUserQuery().queryKey })
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
        case 'SERVER_ERROR':
        case 'VALIDATION_ERROR': {
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
    onSettled: () => queryClient.invalidateQueries({ queryKey: currentUserQuery().queryKey }),
  })
}

/** A signed-out caller is sent to login, and the call resolves `undefined`. */
export function useUpdateUserMutation() {
  const navigate = useNavigate()
  return useMutation({
    async mutationFn(input: UpdateUserInput) {
      const res = await updateUser({ data: input })
      if (res.type === 'AUTH_ERROR') {
        await navigate({ to: '/auth/login' })
      }
      return res.type === 'AUTH_ERROR' ? undefined : res
    },
  })
}
