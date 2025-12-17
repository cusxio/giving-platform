import type { ButtonProps } from '@ariakit/react'
import { Button as BaseButton } from '@ariakit/react'

import { cx } from '#/styles/cx'

export const buttonVariants = {
  white: cx(
    'px-4 text-sm font-semibold transition-colors',
    'bg-fg-1 text-base-1',
    'hover:bg-fg-1/90 active:bg-fg-1/80',
  ),
  lime: cx(
    'px-4 text-sm font-semibold transition-colors',
    'bg-[#d4ff70] text-base-1',
    'active:bg-bg-[#d4ff70]/90 hover:bg-[#d4ff70]/80',
  ),
  subtle: cx(
    'px-2 text-sm transition-colors',
    'border border-border',
    'bg-surface text-fg-muted',
    'hover:bg-elevated hover:text-fg-default',
  ),
}

export function Button(props: ButtonProps) {
  const { className, ...rest } = props
  return (
    <BaseButton
      className={cx(
        'inline-flex items-center justify-center select-none',
        className,
      )}
      {...rest}
    />
  )
}
