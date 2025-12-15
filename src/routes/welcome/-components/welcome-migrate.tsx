import { Separator } from '@ariakit/react'
import { ArrowRightIcon, LeafIcon } from '@phosphor-icons/react/dist/ssr'
import { useCallback, useState } from 'react'

import { TransactionIconStatus } from '#/components/transaction-icon-status'
import { Alert } from '#/components/ui/alert'
import { Button, buttonVariants } from '#/components/ui/button'
import { Spinner } from '#/components/ui/spinner'
import { User } from '#/db/schema'
import { useUpdateUserMutation } from '#/features/user/user.mutations'
import { cx } from '#/styles/cx'

import { useWelcomeViewStore } from './use-welcome-view-store'

export function WelcomeMigrate() {
  const { mutateAsync } = useUpdateUserMutation()
  const [status, setStatus] = useState<
    'error' | 'idle' | NonNullable<User['journey']>
  >('idle')

  const setView = useWelcomeViewStore((state) => state.setView)
  const updateJourney = useCallback(
    (journey: NonNullable<User['journey']>) => {
      if (['migrate', 'start_fresh'].includes(status)) return

      setStatus(journey)
      Promise.all([
        new Promise((resolve) => {
          setTimeout(resolve, 5000)
        }),
        mutateAsync({ journey }),
      ])
        .then(() => {
          setView('done')
        })
        .catch(() => {
          setStatus('error')
        })
    },
    [mutateAsync, setView, status],
  )

  if (['migrate', 'start_fresh'].includes(status)) {
    return (
      <>
        <TransactionIconStatus status="pending" />
        <h1 className="text-center text-xl">
          {status === 'start_fresh'
            ? 'Getting everything ready for your new beginning...'
            : 'Hang tight while we transfer your data over.'}
        </h1>
        <Spinner className="h-12 w-12" />
      </>
    )
  }

  return (
    <>
      <h1 className="text-center text-3xl">Onwards</h1>
      <div className="flex flex-col items-center gap-y-4 text-center text-balance text-fg-muted">
        <p>
          We found past transactions tied to your email from times you explored
          the platform as a guest and completed gifts without creating an
          account.
        </p>

        <Separator
          className="my-4 h-px w-3/4 border-border"
          orientation="horizontal"
        />

        <p>
          As we step into this next chapter, you can{' '}
          <em className="font-medium not-italic">
            transfer your existing giving history or begin anew with a clean
            slate.
          </em>
        </p>

        <p>
          Opting to transfer your giving history will allow you to{' '}
          <strong className="font-medium text-fg-1">
            maintain the continuity of your story
          </strong>
          {', '} while gaining insights into those gifts.
        </p>

        <Separator
          className="my-4 h-px w-3/4 border-border"
          orientation="horizontal"
        />

        <p>The decision is entirely yours.</p>

        <div className="my-4 flex flex-col items-center gap-4 sm:flex-row">
          <Button
            className={cx(buttonVariants.subtle, 'h-10 min-w-42 gap-x-2')}
            onClick={() => {
              updateJourney('start_fresh')
            }}
          >
            Start Fresh
            <LeafIcon size={16} weight="bold" />
          </Button>
          <span>or</span>
          <Button
            className={cx(buttonVariants.lime, 'h-10 min-w-42 gap-x-2')}
            onClick={() => {
              updateJourney('migrate')
            }}
          >
            Transfer History
            <ArrowRightIcon size={16} weight="bold" />
          </Button>
        </div>

        {status === 'error' && (
          <Alert>
            Something went wrong on our end. Please try again later.
          </Alert>
        )}
      </div>
    </>
  )
}
