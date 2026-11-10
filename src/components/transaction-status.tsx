import type { TransactionStatus as Status } from '#/modules/payments'
import { cx } from '#/styles/cx'

interface TransactionStatusProps {
  className?: string
  status: Status
}

export const transactionStatusStyles: Record<Status, string> = {
  cancelled: cx('bg-elevated text-fg-muted'),
  failed: cx('bg-base-error text-fg-error'),
  held: cx('bg-base-warning text-fg-warning'),
  pending: cx('bg-base-warning text-fg-warning'),
  refunded: cx('bg-elevated text-fg-muted'),
  success: cx('bg-base-success text-fg-success'),
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
