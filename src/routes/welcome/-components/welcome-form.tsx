import { Form, FormError, Separator } from '@ariakit/react'
import { ArrowRightIcon } from '@phosphor-icons/react/dist/ssr'
import { useEffect } from 'react'

import { Alert } from '#/components/ui/alert'
import { buttonVariants } from '#/components/ui/button'
import { FormSubmitButton } from '#/components/ui/form-submit-button'
import { UserFormFields } from '#/components/user-form-fields'
import { cx } from '#/styles/cx'

import { useWelcomeForm } from './use-welcome-form'
import { useWelcomeViewStore } from './use-welcome-view-store'

type WelcomeFormProps = Parameters<typeof useWelcomeForm>[0] & {}

export function WelcomeForm(props: WelcomeFormProps) {
  const { user, guestTransactionExists } = props
  const { store, submitting, status } = useWelcomeForm({
    user,
    guestTransactionExists,
  })

  const setView = useWelcomeViewStore((state) => state.setView)
  useEffect(() => {
    if (status === 'idle') return

    setView(status)
  }, [setView, status])

  return (
    <>
      <h1 className="text-center text-3xl">Confirm your details</h1>

      <Separator
        className="h-px w-3/4 border-border"
        orientation="horizontal"
      />

      <Form
        className="grid w-full max-w-sm gap-y-4"
        resetOnSubmit={false}
        store={store}
        validateOnBlur={false}
      >
        <FormError
          name={store.names.__error}
          render={<Alert className="empty:hidden" />}
        />

        <UserFormFields emailReadOnly store={store} />

        <FormSubmitButton
          className={cx(buttonVariants.lime, 'h-10 gap-x-2', 'mt-8')}
          submitting={submitting}
        >
          {guestTransactionExists ? (
            <>
              Continue
              <ArrowRightIcon size={16} weight="bold" />
            </>
          ) : (
            'Continue'
          )}
        </FormSubmitButton>
      </Form>
    </>
  )
}
