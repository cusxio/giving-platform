import { HandHeartIcon, SparkleIcon } from '@phosphor-icons/react/dist/ssr'
import { Link } from '@tanstack/react-router'

import { Button, buttonVariants } from '#/components/ui/button'
import { User } from '#/db/schema'
import { cx } from '#/styles/cx'

interface OverviewWelcomeProps {
  user: Pick<User, 'firstName' | 'lastName'>
}
export function OverviewWelcome(props: OverviewWelcomeProps) {
  const { user } = props

  return (
    <>
      <SparkleIcon className="text-fg-1" size={48} />

      <div className="mb-8 flex flex-col gap-y-4 text-center">
        <h1 className="text-3xl">Welcome, {user.firstName}!</h1>
        <p className="text-balance text-fg-muted">
          You don‘t have any contributions yet. Once you make you first gift,
          your overview will appear here.
        </p>
      </div>

      <Button
        className={cx(buttonVariants.lime, 'h-10 gap-x-2')}
        render={<Link to="/" />}
      >
        Make your first contribution
        <HandHeartIcon size={20} weight="duotone" />
      </Button>
    </>
  )
}
