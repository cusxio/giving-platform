import type { HTMLAttributes } from 'react'

import { cx } from '#/styles/cx'

interface AlertProps extends HTMLAttributes<HTMLDivElement> {}

export function Alert(props: AlertProps) {
  const { className, ...rest } = props
  return (
    <div
      className={cx('bg-base-error p-2 text-sm text-fg-error', className)}
      {...rest}
    />
  )
}
