import { Link } from '@tanstack/react-router'

import type { GetOverviewDataResponse } from '../-data/overview.get-data.procedure'
import { TransactionsTable } from '../../-components/transactions-table'

interface OverviewTransactionsProps extends Pick<
  GetOverviewDataResponse,
  'transactions'
> {
  privacyMode: boolean
  year: 'all' | number
}

export function OverviewTransactions(props: OverviewTransactionsProps) {
  const { privacyMode, transactions, year } = props

  return (
    <div className="my-14">
      <h2 className="border-x border-t border-border bg-base-0 px-4 py-3 text-fg-muted">
        {year === 'all' ? 'All Transactions' : `${year} Transactions`}
      </h2>

      <div className="no-scrollbar overflow-auto">
        <TransactionsTable
          privacyMode={privacyMode}
          transactions={transactions}
        />
      </div>

      <div className="mt-2">
        <Link
          className="px-4 text-sm text-fg-subtle transition-colors hover:text-fg-muted hover:underline"
          to="/transactions"
        >
          View all transactions
        </Link>
      </div>
    </div>
  )
}
