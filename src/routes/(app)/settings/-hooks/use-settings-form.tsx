import type { FormStore } from '@ariakit/react'
import { useFormStore, useFormSubmit, useStoreState } from '@ariakit/react'
import type { QueryClient } from '@tanstack/react-query'
import { useQueryClient } from '@tanstack/react-query'

import { toast } from '#/components/ui/toaster'
import type { CurrentUserResponse, User } from '#/modules/account'
import { currentUserQuery, useUpdateUserMutation } from '#/modules/account'

interface SettingsValues {
  email: string
  firstName: string
  lastName: string
}

/** Saves the profile and reports the outcome. A signed-out save is already on its way to login. */
export async function saveSettings(
  values: SettingsValues,
  updateUser: ReturnType<typeof useUpdateUserMutation>,
  queryClient: QueryClient,
  store: FormStore<SettingsValues>,
) {
  try {
    const res = await updateUser.mutateAsync(
      { firstName: values.firstName, lastName: values.lastName },
      {
        onSuccess(data) {
          queryClient.setQueryData<Extract<CurrentUserResponse, { type: 'SUCCESS' }>>(
            currentUserQuery().queryKey,
            (prev) => {
              if (!prev) {
                return prev
              }
              if (data?.type === 'SUCCESS') {
                return {
                  type: prev.type,
                  value: { ...prev.value, user: { ...prev.value.user, ...data.value.user } },
                }
              }
              return prev
            },
          )
        },
      },
    )

    if (res === undefined) {
      return
    }

    switch (res.type) {
      case 'SERVER_ERROR': {
        toast.unexpected()
        break
      }
      case 'SUCCESS': {
        toast.success('Saved!', { description: 'Your profile information has been updated.' })
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
}

export function useSettingsForm(user: Pick<User, 'email' | 'firstName' | 'lastName'>) {
  const store = useFormStore<SettingsValues>({
    defaultValues: {
      email: user.email,
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
    },
  })

  const queryClient = useQueryClient()
  const updateUser = useUpdateUserMutation()
  useFormSubmit(store, (state) => saveSettings(state.values, updateUser, queryClient, store))

  const submitting = useStoreState(store, 'submitting')

  return { store, submitting }
}
