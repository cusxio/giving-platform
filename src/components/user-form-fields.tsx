import { FormError } from '@ariakit/react'
import type { FormStore } from '@ariakit/react'

import { Alert } from './ui/alert'
import { Input } from './ui/input'

interface UserFormFieldsProps {
  emailReadOnly?: boolean
  nameReadOnly?: boolean
  store: FormStore<{ email: string; firstName: string; lastName: string }>
}

const alert = <Alert className="mt-3 empty:hidden" />

export function UserFormFields(props: UserFormFieldsProps) {
  const { store, emailReadOnly = false, nameReadOnly = false } = props
  return (
    <>
      <div>
        <Input
          label="First name"
          maxLength={32}
          name={store.names.firstName}
          placeholder="Enter your first name..."
          readOnly={nameReadOnly}
          required
        />
        <FormError name={store.names.firstName} render={alert} />
      </div>
      <div>
        <Input
          label="Last name"
          maxLength={32}
          name={store.names.lastName}
          placeholder="Enter your last name..."
          readOnly={nameReadOnly}
          required
        />
        <FormError name={store.names.lastName} render={alert} />
      </div>
      <div>
        <Input
          inputMode="email"
          label="Email"
          name={store.names.email}
          placeholder="give@collective.my"
          readOnly={emailReadOnly}
          required
          type="email"
        />
        <FormError name={store.names.email} render={alert} />
      </div>
    </>
  )
}
