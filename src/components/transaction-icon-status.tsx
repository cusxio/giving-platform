import type { Icon } from '@phosphor-icons/react'
import { CheckCircleIcon, HourglassIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { createElement } from 'react'

import type { TransactionStatus } from '#/modules/payments'
import { cx } from '#/styles/cx'

import { transactionStatusStyles } from './transaction-status'

interface TransactionIconStatusProps {
  className?: string
  status: TransactionStatus
}

const transactionStatusIcon: Record<TransactionStatus, Icon> = {
  failed: WarningCircleIcon,
  pending: HourglassIcon,
  success: CheckCircleIcon,
}

export function TransactionIconStatus(props: TransactionIconStatusProps) {
  const { status, className } = props
  return (
    <span
      className={cx(
        'flex h-16 w-16 items-center justify-center rounded-full',
        transactionStatusStyles[status],
        className,
      )}
    >
      {createElement(transactionStatusIcon[status], { size: 32 })}
    </span>
  )
}
