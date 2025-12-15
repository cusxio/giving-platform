import { CalendarXIcon, HandHeartIcon } from '@phosphor-icons/react/dist/ssr'
import { Link } from '@tanstack/react-router'

import { Button, buttonVariants } from '#/components/ui/button'
import { cx } from '#/styles/cx'

interface OverviewEmptyProps {
  year: number
}

export function OverviewEmpty(props: OverviewEmptyProps) {
  const { year } = props
  return (
    <div className="flex flex-col items-center gap-y-4 border border-border bg-base-1 px-4 py-24">
      <CalendarXIcon size={32} />

      <h1 className="text-center text-xl text-fg-1 sm:text-2xl">
        No contributions yet for {year}
      </h1>

      <p className="text-center text-balance text-fg-muted">
        Your overview will update automatically once you make your first gift of
        the year.
      </p>

      <Button
        className={cx(buttonVariants.lime, 'mt-4 h-10 gap-x-2')}
        render={<Link to="/" />}
      >
        Make a contribution
        <HandHeartIcon size={20} weight="duotone" />
      </Button>
    </div>
  )
}
