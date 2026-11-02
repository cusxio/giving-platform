import type { Receipt } from '#/modules/payments'

import { ReturnToHome } from './return-to-home'
import { TransactionStatusLayout } from './transaction-status-layout'

interface HeldProps {
  transaction: Receipt['transaction']
}

export function Held(props: HeldProps) {
  const { transaction } = props
  const { status } = transaction
  return (
    <TransactionStatusLayout
      h1="We’re Confirming Your Payment"
      p="Your payment is being confirmed. The church will follow up with you."
      status={status}
    >
      <ReturnToHome />
    </TransactionStatusLayout>
  )
}
