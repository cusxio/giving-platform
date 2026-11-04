import { Link } from '@tanstack/react-router'

import { Button, buttonVariants } from '#/components/ui/button'
import type { Receipt } from '#/modules/payments'
import { cx } from '#/styles/cx'

import { TransactionStatusLayout } from './transaction-status-layout'

interface CancelledProps {
  transaction: Receipt['transaction']
}

export function Cancelled(props: CancelledProps) {
  const { transaction } = props
  const { status } = transaction
  return (
    <TransactionStatusLayout
      h1="Donation Not Completed"
      p="This donation wasn’t completed, and no payment was taken."
      status={status}
    >
      <Button className={cx('h-8', buttonVariants.subtle)} render={<Link replace to="/" />}>
        Give Again
      </Button>
    </TransactionStatusLayout>
  )
}
