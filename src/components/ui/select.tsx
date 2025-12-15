import {
  Select as AriakitSelect,
  SelectItem as AriakitSelectItem,
  SelectPopover as AriakitSelectPopover,
} from '@ariakit/react'
import type {
  SelectItemProps,
  SelectPopoverProps,
  SelectProps,
} from '@ariakit/react'

import { cx } from '#/styles/cx'

export function Select(props: SelectProps) {
  const { className, ...rest } = props
  return (
    <AriakitSelect
      className={cx(
        'inline-flex h-9 items-center justify-between gap-2 border border-border px-3 text-sm select-none',
        className,
      )}
      {...rest}
    />
  )
}

export function SelectItem(props: SelectItemProps) {
  const { className, ...rest } = props

  return (
    <AriakitSelectItem
      className={cx(
        'inline-flex h-9 items-center justify-between',
        'px-2 text-sm',
        'transition-colors',
        'cursor-pointer select-none',
        //
        'text-fg-muted',
        'data-[active-item=true]:bg-elevated data-[active-item=true]:text-fg-1',
        className,
      )}
      {...rest}
    />
  )
}

export function SelectPopover(props: SelectPopoverProps) {
  const { className, ...rest } = props
  return (
    <AriakitSelectPopover
      className={cx(
        'flex flex-col',
        'mt-1 p-1',
        'border border-border bg-base-1',
        'scale-95 opacity-0',
        'origin-(--popover-transform-origin)',
        'transition duration-150 ease-out',
        'data-enter:scale-100 data-enter:opacity-100',
        'data-leave:duration-100 data-leave:ease-in',
        className,
      )}
      portal
      sameWidth
      unmountOnHide
      {...rest}
    />
  )
}
