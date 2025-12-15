import { Separator } from '@ariakit/react'
import { ArrowRightIcon } from '@phosphor-icons/react/dist/ssr'

import { Button, buttonVariants } from '#/components/ui/button'
import { cx } from '#/styles/cx'

import { useWelcomeViewStore } from './use-welcome-view-store'
import { WelcomeGreeting } from './welcome-greeting'

export function WelcomeIntro() {
  const setView = useWelcomeViewStore((state) => state.setView)
  return (
    <>
      <WelcomeGreeting />

      <Separator
        className="h-px w-3/4 border-border"
        orientation="horizontal"
      />

      <div
        className={cx(
          'max-w-2xl',
          'flex flex-col gap-y-4',
          'text-center text-balance text-fg-muted',
        )}
      >
        <p>
          Shalom! We’re thrilled to have you join us on our platform, designed
          to elevate your giving experience in every way.
        </p>
        <p>
          Your generosity has the power to create real change, and we’re
          sincerely grateful for your commitment!
        </p>

        <p className="text-fg-1">
          All that’s left is to confirm your details so everything stays in sync
          as you continue.
        </p>
      </div>

      <Separator
        className="h-px w-3/4 border-border"
        orientation="horizontal"
      />

      <Button
        className={cx(buttonVariants.lime, 'h-10 gap-x-2')}
        onClick={() => {
          setView('form')
        }}
      >
        Let’s get started
        <ArrowRightIcon size={16} weight="bold" />
      </Button>
    </>
  )
}
