import { Link } from '@tanstack/react-router'

import { TransactionStatus } from '#/components/transaction-status'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import type { Overview } from '#/modules/history'

import { dayMonthYear, money } from './format'
import { FundName } from './fund-dot'

interface OverviewRecentProps {
  privacyMode: boolean
  recent: Overview['recent']
}

export function OverviewRecent(props: OverviewRecentProps) {
  const { privacyMode, recent } = props

  return (
    <section className="mt-10 flex flex-col">
      <div className="flex items-baseline justify-between gap-x-2 border-x border-t border-border bg-base-0 px-4 py-3">
        <h2 className="text-fg-muted">Recent gifts</h2>
        <Link
          className="text-sm text-fg-subtle transition-colors hover:text-fg-muted hover:underline"
          to="/transactions"
        >
          View all
        </Link>
      </div>

      <div className="no-scrollbar overflow-auto">
        <Table className="min-w-140">
          <TableHeader>
            <TableRow>
              <TableHead className="text-left">Date</TableHead>
              <TableHead className="text-left">Funds</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recent.map((gift) => (
              <TableRow className="text-fg-muted/80" key={gift.id}>
                <TableCell className="whitespace-nowrap tabular-nums">
                  <Link
                    className="hover:text-fg-default hover:underline"
                    params={{ transactionId: gift.id }}
                    to="/transaction/$transactionId"
                  >
                    {dayMonthYear.format(gift.createdAt)}
                  </Link>
                </TableCell>
                <TableCell>
                  <span className="flex flex-wrap gap-x-3 gap-y-1">
                    {gift.funds.map((fundName, index) => (
                      // oxlint-disable-next-line react/no-array-index-key -- a gift can name a fund twice
                      <FundName fundName={fundName} key={index} />
                    ))}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {money(gift.amount, privacyMode)}
                </TableCell>
                <TableCell className="text-right">
                  <TransactionStatus status={gift.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {recent.some((gift) => gift.status === 'pending') && (
        <p className="border-x border-b border-border px-4 py-2.5 text-xs text-fg-subtle">
          Processing means we are waiting for the payment to be confirmed. The gift counts in your
          totals once it is confirmed.
        </p>
      )}
    </section>
  )
}
