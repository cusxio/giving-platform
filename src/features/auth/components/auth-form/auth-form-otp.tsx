import { FormError, FormInput } from '@ariakit/react'
import type { FormStore } from '@ariakit/react'
import { EnvelopeSimpleIcon } from '@phosphor-icons/react/dist/ssr'

import { Alert } from '#/components/ui/alert'
import { buttonVariants } from '#/components/ui/button'
import { FormSubmitButton } from '#/components/ui/form-submit-button'
import { InputOtp } from '#/components/ui/input-otp'
import type { InputOtpProps } from '#/components/ui/input-otp'
import { cx } from '#/styles/cx'

interface AuthFormOtpProps {
  store: FormStore<{ email: string; otp: string }>
  submitting: boolean
}

export function AuthFormOtp(props: AuthFormOtpProps) {
  const { store, submitting } = props

  const handleChange: NonNullable<InputOtpProps['onChange']> = (v) => {
    store.setValue(store.names.otp, v)
  }

  return (
    <>
      <div className="grid gap-y-4">
        <EnvelopeSimpleIcon className="mx-auto" size={40} />
        <h1 className="text-center text-xl font-bold">Check your email</h1>
        <p className="text-center text-fg-muted">
          We've just sent a 6-digit verification code to <br />
          <span className="text-fg-1">{store.getValue(store.names.email)}</span>
        </p>
      </div>

      <div className="mt-12 grid gap-y-6">
        <div className="grid gap-y-3">
          <FormInput
            autoComplete="one-time-code"
            autoFocus
            inputMode="numeric"
            name={store.names.otp}
            render={(props) => {
              const { children, onChange, ...rest } = props
              return <InputOtp onChange={handleChange} {...rest} />
            }}
          />
          <FormError
            name={store.names.otp}
            render={<Alert className="empty:hidden" />}
          />
        </div>
        <FormSubmitButton
          className={cx(buttonVariants.white, 'h-9')}
          submitting={submitting}
        >
          Continue with code
        </FormSubmitButton>
      </div>
    </>
  )
}
