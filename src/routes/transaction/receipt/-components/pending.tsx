import { Spinner } from '#/components/ui/spinner'
import type { Receipt } from '#/modules/payments'

import { TransactionStatusLayout } from './transaction-status-layout'

interface PendingProps {
  transaction: Receipt['transaction']
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
