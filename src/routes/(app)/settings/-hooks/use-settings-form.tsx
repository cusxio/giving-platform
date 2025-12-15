import { useFormStore, useStoreState } from '@ariakit/react'
import { useQueryClient } from '@tanstack/react-query'

import { toast } from '#/components/ui/toaster'
import type { User } from '#/db/schema'
import { GetUserResponse } from '#/features/auth/auth.get-user.procedure'
import { useUpdateUserMutation } from '#/features/user/user.mutations'

export function useSettingsForm(
  user: Pick<User, 'email' | 'firstName' | 'lastName'>,
) {
  const store = useFormStore({
    defaultValues: {
      email: user.email,
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
    },
  })

  const queryClient = useQueryClient()
  const updateUser = useUpdateUserMutation()
  store.useSubmit(async (state) => {
    try {
      const res = await updateUser.mutateAsync(
        { firstName: state.values.firstName, lastName: state.values.lastName },
        {
          onSuccess(data) {
            queryClient.setQueryData<
              Extract<GetUserResponse, { type: 'SUCCESS' }>
            >(['auth-user'], (prev) => {
              if (!prev) return
              if (data?.type === 'SUCCESS') {
                return {
                  value: {
                    ...prev.value,
                    user: { ...prev.value.user, ...data.value.user },
                  },
                  type: prev.type,
                }
              }
              return prev
            })
          },
        },
      )

      switch (res?.type) {
        case 'SERVER_ERROR': {
          toast.unexpected()
          break
        }
        case 'SUCCESS': {
          toast.success('Saved!', {
            description: 'Your profile information has been updated.',
          })
          break
        }
        case 'VALIDATION_ERROR': {
          for (const error of res.errors) {
            const key = error.path.slice(1)
            const value = error.message
            store.setError(key, value)
          }
          break
        }
      }
    } catch {
      toast.unexpected()
    }
  })

  const submitting = useStoreState(store, 'submitting')

  return { store, submitting }
}
