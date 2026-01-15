import { Form } from '@ariakit/react'
import { useCallback } from 'react'

import { Spinner } from '#/components/ui/spinner'
import { funds } from '#/core/brand'
import type { Fund } from '#/core/brand/funds'
import type { User } from '#/db/schema'
import { useSuspenseQueryDeferred } from '#/hooks'

import { createSavedPaymentMethodsQueryOptions } from '../../-index.queries'

import { GivingFormDetails } from './giving-form-details'
import { GivingFormFund } from './giving-form-fund'
import { GivingFormTotal } from './giving-form-total'
import type { GivingFormView } from './use-giving-form'
import { extractFundAmounts, useGivingForm } from './use-giving-form'

interface GivingFormProps {
  initialFunds: Partial<Record<Fund, string>>
  initialView: GivingFormView
  onBack: () => void
  onContinue: (funds: Record<Fund, string>) => void
  user?: Pick<User, 'email' | 'firstName' | 'lastName'>
}

export function GivingForm(props: GivingFormProps) {
  const { user, initialFunds, initialView, onContinue, onBack } = props
  const authenticated = user ? true : false

  const { data: savedPaymentMethods } = useSuspenseQueryDeferred(
    createSavedPaymentMethodsQueryOptions(authenticated),
  )
  const { store, view, setView, submitPayment } = useGivingForm(
    user,
    savedPaymentMethods[0]?.token,
    { initialFunds, initialView },
  )

  store.useSubmit(async () => {
    if (view === 'amounts') {
      onContinue(extractFundAmounts(store))
      setView('details')
      return
    }

    await submitPayment()
  })

  const handleGoBack = useCallback(() => {
    if (view === 'details') {
      onBack()
      setView('amounts')
    }
  }, [view, onBack, setView])

  if (view === 'redirecting') {
    return (
      <div className="flex flex-col items-center gap-y-4">
        <Spinner className="h-10 w-10 text-fg-muted" />
        <h1 className="text-lg text-fg-1">Redirecting to secure payment...</h1>
      </div>
    )
  }

  return (
    <Form
      className="@container/form flex flex-col gap-y-4"
      resetOnSubmit={false}
      store={store}
      validateOnBlur={false}
      validateOnChange={false}
    >
      {view === 'amounts' && (
        <>
          <GivingFormHero />

          {funds.map((fund) => (
            <GivingFormFund fund={fund} key={fund} store={store} />
          ))}
        </>
      )}

      {view === 'details' && (
        <GivingFormDetails
          authenticated={authenticated}
          savedPaymentMethods={savedPaymentMethods}
          store={store}
        />
      )}

      <GivingFormTotal onGoBack={handleGoBack} store={store} view={view} />
    </Form>
  )
}

function GivingFormHero() {
  return (
    <h1 className="mb-4 text-center font-serif text-3xl tracking-wide text-balance sm:text-4xl md:text-5xl">
      I would{' '}
      <span className="text-[#ff9592] underline underline-offset-8">love</span>{' '}
      to give,
    </h1>
  )
}
