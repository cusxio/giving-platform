import { Form, Separator } from '@ariakit/react'
import { createFileRoute } from '@tanstack/react-router'

import { buttonVariants } from '#/components/ui/button'
import { FormSubmitButton } from '#/components/ui/form-submit-button'
import { UserFormFields } from '#/components/user-form-fields'
import { useAuthUser } from '#/features/session/session.queries'
import { cx } from '#/styles/cx'

import { useSettingsForm } from './-hooks/use-settings-form'

export const Route = createFileRoute('/(app)/settings')({
  component: RouteComponent,
})

function RouteComponent() {
  const { user } = useAuthUser()

  const { store, submitting } = useSettingsForm(user)

  return (
    <div className="mx-auto w-full max-w-lg p-4">
      <div>
        <h1 className="text-lg">Profile</h1>
        <p className="text-sm text-fg-muted">Manage your profile</p>
        <Separator className="my-4 h-px border-border/70" />
      </div>

      <Form className="grid gap-y-6" resetOnSubmit={false} store={store}>
        <UserFormFields emailReadOnly store={store} />
        <div className="flex justify-end">
          <FormSubmitButton
            className={cx(buttonVariants.white, 'h-9')}
            submitting={submitting}
          >
            Update
          </FormSubmitButton>
        </div>
      </Form>
    </div>
  )
}
