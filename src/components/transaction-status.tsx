import type { Transaction } from '#/db/schema'
import { cx } from '#/styles/cx'

interface TransactionStatusProps {
  className?: string
  status: Transaction['status']
}

export const transactionStatusStyles: Record<Transaction['status'], string> = {
  failed: cx('bg-base-error text-fg-error'),
  success: cx('bg-base-success text-fg-success'),
  pending: cx('bg-base-warning text-fg-warning'),
}

export function TransactionStatus(props: TransactionStatusProps) {
  const { status, className } = props
  return (
    <span
      className={cx(
        'inline-flex items-center justify-center',
        'h-6 rounded-full px-3 select-none',
        'text-sm capitalize',
        transactionStatusStyles[status],
        className,
      )}
    >
      {status}
    </span>
  )
}
