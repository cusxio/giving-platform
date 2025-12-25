import type { FormStore } from '@ariakit/react'
import { FormError } from '@ariakit/react'

import { Alert } from '#/components/ui/alert'
import { buttonVariants } from '#/components/ui/button'
import { FormSubmitButton } from '#/components/ui/form-submit-button'
import { Input } from '#/components/ui/input'
import { config } from '#/core/brand'
import { cx } from '#/styles/cx'

interface AuthFormEmailProps {
  mode: 'login' | 'signup'
  store: FormStore<{ email: string; otp: string }>
  submitting: boolean
}

export default function AuthFormEmail(props: AuthFormEmailProps) {
  const { store, mode, submitting } = props

  return (
    <>
      <h1 className="text-center font-serif text-xl">
        {mode === 'login' ? 'Welcome to Collective' : 'Create an account'}
      </h1>
      <div className="my-8 grid gap-y-4">
        <div className="grid gap-y-2">
          <Input
            autoCapitalize="none"
            hideLabel
            inputMode="email"
            label="Email"
            name={store.names.email}
            placeholder="Enter your email..."
            required
          />
          <FormError
            name={store.names.email}
            render={<Alert className="empty:hidden" />}
          />
        </div>
        <FormSubmitButton
          className={cx(buttonVariants.white, 'h-9')}
          submitting={submitting}
        >
          Continue with email
        </FormSubmitButton>
      </div>
      <hr className="mb-4 border-border" />
      <p className="text-center text-xs leading-5 text-balance text-fg-subtle">
        {mode === 'login' ? (
          <>We'll email you a one-time code to log in securely.</>
        ) : (
          <>
            By signing up, you agree to our <br />
            <a className="text-fg-muted hover:underline" href={config.termsURL}>
              Terms of Use
            </a>
            {', '}
            <a
              className="text-fg-muted hover:underline"
              href={config.privacyURL}
            >
              Privacy Policy
            </a>
            {' and '}
            <a
              className="text-fg-muted hover:underline"
              href={config.refundURL}
            >
              Refund Policy
            </a>
            {/*
             */}
            .
          </>
        )}
      </p>
    </>
  )
}
