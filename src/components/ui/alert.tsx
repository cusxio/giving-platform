import type { HTMLAttributes } from 'react'

import { cx } from '#/styles/cx'

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'error' | 'info'
}

const alertVariants = {
  error: cx('bg-base-error text-fg-error'),
  info: cx('bg-base-info text-fg-info'),
}

export function Alert(props: AlertProps) {
  const { className, variant = 'error', ...rest } = props

  return (
    <div
      className={cx('p-2 text-sm', alertVariants[variant], className)}
      {...rest}
    />
  )
}
