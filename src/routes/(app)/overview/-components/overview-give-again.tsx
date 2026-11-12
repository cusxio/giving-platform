import { Link } from '@tanstack/react-router'

import { Button, buttonVariants } from '#/components/ui/button'
import type { Overview } from '#/modules/history'
import { cx } from '#/styles/cx'

import { dayMonth, money } from './format'
import { FundName } from './fund-dot'
import { OverviewCard } from './overview-card'

interface OverviewGiveAgainProps {
  className?: string
  gift: NonNullable<Overview['giveAgain']>
  privacyMode: boolean
}

export function OverviewGiveAgain(props: OverviewGiveAgainProps) {
  const { className, gift, privacyMode } = props

  return (
    <OverviewCard className={className} title="Give again">
      <div className="flex flex-col gap-y-4 p-4">
        <span className="text-xs text-fg-subtle">Your last gift, {dayMonth.format(gift.date)}</span>
        <ul className="flex flex-wrap gap-2">
          {gift.items.map((item) => (
            <li
              className="flex items-center gap-x-2 border border-border px-2.5 py-1.5 text-sm text-fg-1"
              key={item.fundName}
            >
              <FundName fundName={item.fundName} />
              <span className="tabular-nums">{money(item.amount, privacyMode)}</span>
            </li>
          ))}
        </ul>
        <Button
          className={cx(buttonVariants.subtle, 'h-11 text-fg-1')}
          render={<Link search={gift.give} to="/" />}
        >
          Give the same again
        </Button>
      </div>
    </OverviewCard>
  )
}
