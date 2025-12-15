import { useFormStore, useStoreState } from '@ariakit/react'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import { assertExhaustive } from '#/core/assert-exhaustive'
import { User } from '#/db/schema'
import { useUpdateUserMutation } from '#/features/user/user.mutations'

import { getWelcomeData } from '../-data/welcome.get-data.procedure'

export function useWelcomeForm(params: {
  guestTransactionExists: boolean
  user: Pick<User, 'email' | 'firstName' | 'lastName'>
}) {
  const { user, guestTransactionExists } = params
  const store = useFormStore({
    defaultValues: {
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      email: user.email,
      __error: '',
    },
  })

  const [status, setStatus] = useState<'done' | 'idle' | 'migrate'>('idle')
  store.useValidate(() => {
    store.setError(store.names.__error, undefined)
  })

  const setServerError = useCallback(() => {
    store.setError(
      store.names.__error,
      'Something went wrong on our end. Please try again later.',
    )
  }, [store])

  const updateUser = useUpdateUserMutation()
  const queryClient = useQueryClient()
  store.useSubmit(async (state) => {
    try {
      const res = await updateUser.mutateAsync(
        {
          firstName: state.values.firstName,
          lastName: state.values.lastName,
          // undefined because it will be handled in the following flow
          journey: guestTransactionExists ? undefined : 'start_fresh',
        },
        {
          onSuccess(data) {
            if (data?.type !== 'SUCCESS') return

            queryClient.setQueryData<
              Awaited<ReturnType<typeof getWelcomeData>>
            >(['welcome'], (prev) => {
              if (!prev) return
              return { ...prev, user: { ...prev.user, ...data.value.user } }
            })
          },
        },
      )

      if (!res) return

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

  return { store, submitting, status }
}
