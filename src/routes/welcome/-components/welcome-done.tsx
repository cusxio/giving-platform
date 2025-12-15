import { ArrowRightIcon } from '@phosphor-icons/react/dist/ssr'
import { useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'

import { TransactionIconStatus } from '#/components/transaction-icon-status'
import { Button, buttonVariants } from '#/components/ui/button'
import { cx } from '#/styles/cx'

export function WelcomeDone() {
  const navigate = useNavigate()
  const goToOverview = useCallback(() => {
    void navigate({ to: '/overview', replace: true })
  }, [navigate])

  return (
    <>
      <TransactionIconStatus status="success" />
      <div className="flex flex-col gap-y-4">
        <h1 className="text-center text-4xl font-bold">You’re all set!</h1>
        <p className="text-center text-balance text-fg-muted">
          Your setup is complete and everything’s ready for you. Take a moment
          to look around and make yourself at home.
        </p>
      </div>
      <Button
        className={cx(buttonVariants.subtle, 'h-10 gap-x-2')}
        onClick={goToOverview}
      >
        Continue to home
        <ArrowRightIcon size={16} weight="bold" />
      </Button>
    </>
  )
}
