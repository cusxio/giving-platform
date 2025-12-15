import { Spinner } from '#/components/ui/spinner'
import type { Transaction } from '#/db/schema'

import { TransactionStatusLayout } from './transaction-status-layout'

interface PendingProps {
  transaction: Pick<Transaction, 'id' | 'status'>
}

export function Pending(props: PendingProps) {
  const { transaction } = props
  const { status } = transaction
  return (
    <TransactionStatusLayout
      h1="Your Transaction is Processing"
      p="Your gift is on its way. Some payment methods, like bank transfers, can take a while to complete."
      status={status}
    >
      <Spinner className="h-12 w-12" />
    </TransactionStatusLayout>
  )
}
