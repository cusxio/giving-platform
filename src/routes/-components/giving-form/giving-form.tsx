import { Form } from '@ariakit/react'
import { useQuery } from '@tanstack/react-query'

import { Spinner } from '#/components/ui/spinner'
import { funds } from '#/core/brand'
import type { User } from '#/db/schema'

import { createSavedPaymentMethodsQueryOptions } from '../../-index.queries'

import { GivingFormDetails } from './giving-form-details'
import { GivingFormFund } from './giving-form-fund'
import { GivingFormTotal } from './giving-form-total'
import { useGivingForm } from './use-giving-form'

interface GivingFormProps {
  user?: Pick<User, 'email' | 'firstName' | 'lastName'>
}

export function GivingForm(props: GivingFormProps) {
  const { user } = props
  const authenticated = user ? true : false

  const { data } = useQuery(
    createSavedPaymentMethodsQueryOptions(authenticated),
  )
  const savedPaymentMethods = data ?? []
  const { store, view, onGoBack } = useGivingForm(
    user,
    savedPaymentMethods[0]?.token,
  )

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

      <GivingFormTotal onGoBack={onGoBack} store={store} view={view} />
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
