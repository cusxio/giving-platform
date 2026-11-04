import { Link } from '@tanstack/react-router'

import { Button, buttonVariants } from '#/components/ui/button'
import type { Receipt } from '#/modules/payments'
import { cx } from '#/styles/cx'

import { TransactionStatusLayout } from './transaction-status-layout'

interface RefundedProps {
  transaction: Receipt['transaction']
}

export function Refunded(props: RefundedProps) {
  const { transaction } = props
  const { status } = transaction
  return (
    <TransactionStatusLayout
      h1="Donation Refunded"
      p="This donation was refunded. No money was kept."
      status={status}
    >
      <Button className={cx('h-8', buttonVariants.subtle)} render={<Link replace to="/" />}>
        Give Again
      </Button>
    </TransactionStatusLayout>
  )
}
