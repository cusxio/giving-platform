import { CreditCardIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { Link } from '@tanstack/react-router'

import { monthLabel } from '#/core/formatters'
import type { Overview } from '#/modules/history'

import { dayMonth, listFunds, money } from './format'

interface OverviewNoticesProps {
  notices: Overview['notices']
  privacyMode: boolean
}

export function OverviewNotices(props: OverviewNoticesProps) {
  const {
    notices: { expiringCard, failedGift },
    privacyMode,
  } = props

  if (!expiringCard && !failedGift) {
    return null
  }

  return (
    <ul className="flex flex-col divide-y divide-border border border-border">
      {failedGift && (
        <li className="flex flex-wrap items-center justify-between gap-3 bg-base-error px-4 py-3">
          <span className="flex items-center gap-x-2.5 text-fg-error">
            <WarningCircleIcon aria-hidden className="shrink-0" size={18} />
            {/* A cancel and a page timeout look the same, so this never says the donor left. */}
            Your {money(failedGift.amount, privacyMode)} gift to{' '}
            {listFunds(failedGift.items.map((item) => item.fundName))} on{' '}
            {dayMonth.format(failedGift.date)} did not go through.
          </span>
          <Link
            className="flex h-9 items-center border border-fg-error/40 px-3.5 text-sm font-medium text-fg-1 hover:bg-fg-error/10"
            search={failedGift.give}
            to="/"
          >
            Try again
          </Link>
        </li>
      )}
      {expiringCard && (
        <li className="flex items-center gap-x-2.5 bg-base-1 px-4 py-2.5 text-sm text-fg-muted">
          <CreditCardIcon aria-hidden className="shrink-0" size={16} />
          Your saved {expiringCard.cardType} card ending {expiringCard.last4} expires at the end of{' '}
          {monthLabel(expiringCard.expires.month, 'long')}. Next time you give, you can add a new
          card.
        </li>
      )}
    </ul>
  )
}
