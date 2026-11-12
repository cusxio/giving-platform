import { Meter } from '#/components/ui/chart'
import type { Overview } from '#/modules/history'

import { money } from './format'
import { fundColorClass, FundName } from './fund-dot'
import { OverviewCard } from './overview-card'

interface OverviewFundsProps {
  className?: string
  funds: Overview['funds']
  privacyMode: boolean
}

export function OverviewFunds(props: OverviewFundsProps) {
  const { className, funds, privacyMode } = props

  return (
    <OverviewCard className={className} title="By fund">
      {funds.length === 0 ? (
        <p className="p-4 text-sm text-fg-muted">Your funds will appear after your first gift.</p>
      ) : (
        <ul className="flex flex-col gap-y-4 p-4">
          {funds.map((fund) => (
            <li className="flex flex-col gap-y-2" key={fund.fundName}>
              <div className="flex items-baseline justify-between gap-x-2 text-sm">
                <span className="text-fg-1">
                  <FundName fundName={fund.fundName} />
                </span>
                <span className="text-fg-1 tabular-nums">
                  {money(fund.amount, privacyMode)}
                  <span className="ml-2 text-xs text-fg-subtle">
                    {Math.round(fund.share * 100)}%
                  </span>
                </span>
              </div>
              <Meter
                className={fundColorClass(fund.fundName)}
                color="currentColor"
                label={`${fund.fundName} share`}
                value={fund.share}
              />
            </li>
          ))}
        </ul>
      )}
    </OverviewCard>
  )
}
