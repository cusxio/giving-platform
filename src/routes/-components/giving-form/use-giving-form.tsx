import type { FormStore } from '@ariakit/react'
import { useFormStore } from '@ariakit/react'
import { Link } from '@tanstack/react-router'
import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useRef, useState } from 'react'
import { useDeepCompareEffect } from 'use-deep-compare'

import { __NORMAL_CHECKOUT__ } from '#/components/ui/payment-methods'
import { toast } from '#/components/ui/toaster'
import { assertExhaustive } from '#/core/assert-exhaustive'
import { funds } from '#/core/brand'
import type { Fund } from '#/core/brand/funds'
import type { SavedPaymentMethod, User } from '#/db/schema'
import type { StartContributionResponse } from '#/features/giving/contribution.mutations'
import { useStartContributionMutation } from '#/features/giving/contribution.mutations'

export type GivingFormStore = ReturnType<typeof useGivingForm>['store']
export type GivingFormView = 'amounts' | 'details' | 'redirecting'

interface UseGivingFormInput {
  savedPaymentToken?: SavedPaymentMethod['token']
  user?: Pick<User, 'email' | 'firstName' | 'lastName'>
}

interface UseGivingFormOptions {
  initialFunds: Partial<Record<Fund, string>>
  initialView: GivingFormView
}

export function extractFundAmounts(
  store: GivingFormStore,
): Record<Fund, string> {
  const values = store.getState().values
  return Object.fromEntries(funds.map((f) => [f, values[f]])) as Record<
    Fund,
    string
  >
}

export function useGivingForm(
  user: UseGivingFormInput['user'],
  savedPaymentToken: UseGivingFormInput['savedPaymentToken'],
  options: UseGivingFormOptions,
) {
  const { initialFunds, initialView } = options

  const store = useFormStore({
    defaultValues: getInitialFormValues(user, savedPaymentToken, initialFunds),
  })
  const [view, setView] = useState<GivingFormView>(initialView)

  const isInitialMountRef = useRef(true)
  useDeepCompareEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false
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

  const startContribution = useStartContributionMutation()

  const submitPayment = useCallback(async () => {
    const values = store.getState().values
    await handleFormSubmission(values, startContribution, store, setView)
  }, [store, startContribution])

  return { store, view, setView, submitPayment }
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
  initialFunds?: Partial<Record<Fund, string>>,
) {
  const fundValues = Object.fromEntries(
    funds.map((f) => [f, initialFunds?.[f] ?? '']),
  ) as Record<Fund, string>
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
      store.setFieldTouched('email_info', true)
      store.setError(
        'email_info',
        // @ts-expect-error https://github.com/ariakit/ariakit/issues/2815
        <>
          <span className="pr-2">👋🏻</span> We recognize this email! For security
          reasons, please{' '}
          <Link
            className="font-bold underline"
            search={{ email }}
            to="/auth/login"
          >
            log in
          </Link>{' '}
          to give. We'll send you a one-time code to verify.
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
