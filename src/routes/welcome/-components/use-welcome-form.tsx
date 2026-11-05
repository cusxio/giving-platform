import { useFormStore, useFormSubmit, useFormValidate, useStoreState } from '@ariakit/react'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import { assertExhaustive } from '#/core/assert-exhaustive'
import type { User } from '#/modules/account'
import { useUpdateUserMutation, welcomeQuery } from '#/modules/account'

export function useWelcomeForm(params: {
  guestTransactionExists: boolean
  user: Pick<User, 'email' | 'firstName' | 'lastName'>
}) {
  const { user, guestTransactionExists } = params
  const store = useFormStore({
    defaultValues: {
      __error: '',
      email: user.email,
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
    },
  })

  const [status, setStatus] = useState<'done' | 'idle' | 'migrate'>('idle')
  useFormValidate(store, () => {
    store.setError(store.names.__error, undefined)
  })

  const setServerError = useCallback(() => {
    store.setError(store.names.__error, 'Something went wrong on our end. Please try again later.')
  }, [store])

  const updateUser = useUpdateUserMutation()
  const queryClient = useQueryClient()
  useFormSubmit(store, async (state) => {
    try {
      const res = await updateUser.mutateAsync(
        {
          firstName: state.values.firstName,
          lastName: state.values.lastName,
          // Undefined because it will be handled in the following flow
          journey: guestTransactionExists ? undefined : 'start_fresh',
        },
        {
          onSuccess(data) {
            if (data?.type !== 'SUCCESS') {
              return
            }

            queryClient.setQueryData(welcomeQuery().queryKey, (prev) => {
              if (!prev) {
                return prev
              }
              return { ...prev, user: { ...prev.user, ...data.value.user } }
            })
          },
        },
      )

      if (!res) {
        return
      }

      switch (res.type) {
        case 'SERVER_ERROR': {
          setServerError()
          break
        }
        case 'SUCCESS': {
          if (guestTransactionExists) {
            setStatus('migrate')
          } else {
            setStatus('done')
          }
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
        default: {
          assertExhaustive(res)
        }
      }
    } catch {
      setServerError()
    }
  })

  const submitting = useStoreState(store, 'submitting')

  return { status, store, submitting }
}
