import { useFormStore, useStoreState } from '@ariakit/react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { toast } from '#/components/ui/toaster'
import { assertExhaustive } from '#/core/assert-exhaustive'

import type {
  RequestOtpResponse,
  VerifyOtpResponse,
} from '../../auth.mutations'
import {
  useRequestOtpMutation,
  useVerifyOtpMutation,
} from '../../auth.mutations'

const fallback = 'Something unexpected has occurred. Please try again later.'

export function useAuthForm(mode: 'login' | 'signup', defaultEmail?: string) {
  const [view, setView] = useState<'enter-email' | 'enter-otp'>('enter-email')
  const store = useFormStore({
    defaultValues: { otp: '', email: defaultEmail ?? '' },
    setValues(values) {
      if (view === 'enter-otp' && values.otp.length === 6) {
        void store.submit()
      }
    },
  })

  const requestOtp = useRequestOtpMutation()
  const verifyOtp = useVerifyOtpMutation()

  const queryClient = useQueryClient()
  const navigate = useNavigate()

  store.useSubmit(async (state) => {
    const { otp, email } = state.values

    // enter-email flow
    if (view === 'enter-email') {
      try {
        const res = await requestOtp.mutateAsync({ mode, email })
        switch (res?.type) {
          case 'BUSINESS_ERROR':
          case 'VALIDATION_ERROR': {
            store.setError(
              store.names.email,
              // @ts-expect-error https://github.com/ariakit/ariakit/issues/2815
              getEnterEmailErrorMessage(email, res),
            )
            break
          }
          case 'SERVER_ERROR': {
            toast.unexpected()
            break
          }
          case 'SUCCESS': {
            setView('enter-otp')
            break
          }
        }
      } catch {
        toast.unexpected()
      }

      return
    }

    try {
      const res = await verifyOtp.mutateAsync({ otp, email, mode })

      if (!res) return

      switch (res.type) {
        case 'BUSINESS_ERROR':
        case 'VALIDATION_ERROR': {
          store.setError(store.names.otp, getEnterOtpErrorMessage(res))
          break
        }
        case 'SERVER_ERROR': {
          toast.unexpected()
          break
        }
        case 'SUCCESS': {
          queryClient.removeQueries({ queryKey: ['auth-user'] })
          await navigate({ to: mode === 'signup' ? '/welcome' : '/' })
          break
        }
        default: {
          assertExhaustive(res)
        }
      }
    } catch {
      toast.unexpected()
    }
  })

  const submitting = useStoreState(store, 'submitting')

  return { submitting, view, store }
}

function getEnterEmailErrorMessage(
  email: string,
  response: Exclude<RequestOtpResponse, { type: 'SUCCESS' }>,
) {
  if (response.type === 'BUSINESS_ERROR') {
    const { code } = response.error

    if (code === 'ALREADY_EXISTS') {
      return (
        <>
          This email address already exists.{' '}
          <Link
            className="font-bold underline"
            search={{ email }}
            to="/auth/login"
          >
            Log in
          </Link>{' '}
          instead?
        </>
      )
    }

    return (
      <>
        There is no account associated with this email address. Consider{' '}
        <Link
          className="font-bold underline"
          search={{ email }}
          to="/welcome/signup"
        >
          signing up
        </Link>
        ?
      </>
    )
  }

  if (response.type === 'VALIDATION_ERROR') {
    return response.errors[0]?.message ?? fallback
  }

  return fallback
}

function getEnterOtpErrorMessage(
  response: Exclude<VerifyOtpResponse, { type: 'SUCCESS' }>,
) {
  if (response.type === 'BUSINESS_ERROR') {
    const { code } = response.error

    if (code === 'INVALID_REQUEST') {
      return 'We couldn’t process your request. Please check your input and try again.'
    }

    return 'This code doesn’t match the one we sent, typo?'
  }

  if (response.type === 'VALIDATION_ERROR') {
    return response.errors[0]?.message ?? fallback
  }

  return fallback
}
