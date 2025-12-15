import { FormStore, useFormStore } from '@ariakit/react'
import { Link } from '@tanstack/react-router'
import { Dispatch, SetStateAction, useCallback, useRef, useState } from 'react'
import { useDeepCompareEffect } from 'use-deep-compare'

import { __NORMAL_CHECKOUT__ } from '#/components/ui/payment-methods'
import { toast } from '#/components/ui/toaster'
import { assertExhaustive } from '#/core/assert-exhaustive'
import { funds } from '#/core/brand'
import type { Fund } from '#/core/brand/funds'
import type { SavedPaymentMethod, User } from '#/db/schema'
import {
  StartContributionResponse,
  useStartContributionMutation,
} from '#/features/giving/contribution.mutations'

export type GivingFormStore = ReturnType<typeof useGivingForm>['store']
export type GivingFormView = 'amounts' | 'details' | 'redirecting'

interface UseGivingFormInput {
  savedPaymentToken?: SavedPaymentMethod['token']
  user?: Pick<User, 'email' | 'firstName' | 'lastName'>
}

export function useGivingForm(
  user: UseGivingFormInput['user'],
  savedPaymentToken: UseGivingFormInput['savedPaymentToken'],
) {
  const store = useFormStore({
    defaultValues: getInitialFormValues(user, savedPaymentToken),
  })
  const [view, setView] = useState<GivingFormView>('amounts')

  const isInitialMount = useRef(true)
  useDeepCompareEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    store.setValues((current) => {
      const incoming = getFormValues(user, savedPaymentToken)

      return {
        ...current,
        // Always sync the token (hidden field)
        token: incoming.token,

        // Only update visible fields if they are currently empty
        email: current.email || incoming.email,
        firstName: current.firstName || incoming.firstName,
        lastName: current.lastName || incoming.lastName,
      }
    })
  }, [user, store.setValues, savedPaymentToken])

  const onGoBack = useCallback(() => {
    if (view === 'details') {
      setView('amounts')
    }
  }, [view])

  const startContribution = useStartContributionMutation()
  store.useSubmit(async ({ values }) => {
    if (view === 'amounts') {
      setView('details')
      return
    }

    await handleFormSubmission(values, startContribution, store, setView)
  })

  return { store, view, onGoBack }
}

function getFormValues(
  user: UseGivingFormInput['user'],
  savedPaymentToken: UseGivingFormInput['savedPaymentToken'],
) {
  return {
    email: user?.email ?? '',
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    token: savedPaymentToken,
  }
}

function getInitialFormValues(
  user: UseGivingFormInput['user'],
  savedPaymentToken: UseGivingFormInput['savedPaymentToken'],
) {
  const fundValues = Object.fromEntries(funds.map((f) => [f, ''])) as Record<
    Fund,
    string
  >
  return { ...fundValues, ...getFormValues(user, savedPaymentToken) }
}

function handleBusinessError(
  error: Extract<
    StartContributionResponse,
    { type: 'BUSINESS_ERROR' }
  >['error'],
  store: FormStore<ReturnType<typeof getInitialFormValues>>,
  email: string,
) {
  switch (error.code) {
    case 'EMAIL_EXISTS': {
      store.setError(
        store.names.email,
        // @ts-expect-error https://github.com/ariakit/ariakit/issues/2815
        <>
          The email address provided is already associated with an existing
          account. Please{' '}
          <Link
            className="font-bold underline"
            search={{ email }}
            to="/auth/login"
          >
            log in
          </Link>{' '}
          to continue.
        </>,
      )
      break
    }

    case 'INVALID_REQUEST': {
      toast.error('Invalid Request', {
        description: 'The total contribution amount must be greater than zero.',
      })
      break
    }

    case 'USER_MISMATCH': {
      store.setError(
        store.names.email,
        'This email cannot be used while you’re logged in.',
      )
      break
    }

    default: {
      assertExhaustive(error.code)
    }
  }
}

async function handleFormSubmission(
  values: ReturnType<typeof getInitialFormValues>,
  startContribution: ReturnType<typeof useStartContributionMutation>,
  store: FormStore<ReturnType<typeof getInitialFormValues>>,
  setView: Dispatch<SetStateAction<GivingFormView>>,
) {
  const { email, firstName, lastName, token, ...contributionAmounts } = values

  try {
    const res = await startContribution.mutateAsync({
      email,
      firstName,
      lastName,
      contributions: contributionAmounts,
      token: token === __NORMAL_CHECKOUT__ ? undefined : token,
    })

    const success = handleSubmissionResponse(res, email, store)

    if (success) {
      setView('redirecting')
    }
  } catch {
    toast.unexpected()
  }
}

function handleSubmissionResponse(
  res: StartContributionResponse,
  email: string,
  store: FormStore<ReturnType<typeof getInitialFormValues>>,
) {
  switch (res.type) {
    case 'BUSINESS_ERROR': {
      handleBusinessError(res.error, store, email)
      break
    }

    case 'SERVER_ERROR': {
      toast.unexpected()
      break
    }

    case 'SUCCESS': {
      window.location.replace(res.value.redirectURL)
      return true
    }

    case 'VALIDATION_ERROR': {
      handleValidationErrors(res.errors, store)
      break
    }

    default: {
      assertExhaustive(res)
    }
  }
}

function handleValidationErrors(
  errors: { message: string; path: string }[],
  store: ReturnType<typeof useFormStore>,
) {
  for (const error of errors) {
    const key = error.path.slice(1)
    store.setError(key, error.message)
  }
}
