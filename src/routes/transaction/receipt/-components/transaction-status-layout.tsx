import type { ReactNode } from 'react'

import { TransactionIconStatus } from '#/components/transaction-icon-status'
import type { Transaction } from '#/db/schema'

interface TransactionStatusLayoutProps {
  children?: ReactNode
  h1: ReactNode
  p: ReactNode
  status: Transaction['status']
}
export function TransactionStatusLayout(props: TransactionStatusLayoutProps) {
  const { status, h1, p, children } = props

  return (
    <div className="flex flex-col items-center gap-y-8">
      <TransactionIconStatus status={status} />

      <h1 className="text-center text-4xl font-bold text-balance">{h1}</h1>

      <p className="text-center text-balance text-fg-muted">{p}</p>

      {children}
    </div>
  )
}
