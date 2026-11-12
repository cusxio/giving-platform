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

const STATUS_LABELS: Record<Status, { hint?: string; label: string }> = {
  cancelled: { label: 'Cancelled' },
  failed: { label: 'Failed' },
  held: { label: 'Held' },
  pending: { hint: 'Waiting for the payment to be confirmed', label: 'Processing' },
  refunded: { label: 'Refunded' },
  success: { label: 'Success' },
}

export function TransactionStatus(props: TransactionStatusProps) {
  const { status, className } = props
  const { hint, label } = STATUS_LABELS[status]
  return (
    <span
      className={cx(
        'inline-flex items-center justify-center',
        'h-6 rounded-full px-3 select-none',
        'text-sm',
        transactionStatusStyles[status],
        className,
      )}
      title={hint}
    >
      {label}
    </span>
  )
}
