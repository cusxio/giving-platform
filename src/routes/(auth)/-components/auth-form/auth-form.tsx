import { Form } from '@ariakit/react'

import AuthFormEmail from './auth-form-email'
import { AuthFormOtp } from './auth-form-otp'
import { useAuthForm } from './use-auth-form'

interface AuthFormProps {
  email?: string
  mode: 'login' | 'signup'
}

export function AuthForm(props: AuthFormProps) {
  const { mode, email } = props
  const { store, submitting, view } = useAuthForm(mode, email)

  return (
    <Form
      className="w-full max-w-xs"
      resetOnSubmit={false}
      store={store}
      validateOnBlur={false}
      validateOnChange={false}
    >
      {view === 'enter-email' ? (
        <AuthFormEmail mode={mode} store={store} submitting={submitting} />
      ) : (
        <AuthFormOtp store={store} submitting={submitting} />
      )}
    </Form>
  )
}
