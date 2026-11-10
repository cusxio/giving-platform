import type { ComboboxItemProps, ComboboxPopoverProps, ComboboxSelectProps } from '@ariakit/react'
import { ComboboxItem, ComboboxPopover, ComboboxSelect } from '@ariakit/react'

import { cx } from '#/styles/cx'

export function Select(props: ComboboxSelectProps) {
  const { className, ...rest } = props
  return (
    <ComboboxSelect
      className={cx(
        'inline-flex h-9 items-center justify-between gap-2 border border-border px-3 text-sm select-none',
        className,
      )}
      {...rest}
    />
  )
}

export function SelectItem(props: ComboboxItemProps) {
  const { className, ...rest } = props

  return (
    <ComboboxItem
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

export function SelectPopover(props: ComboboxPopoverProps) {
  const { className, ...rest } = props
  return (
    <ComboboxPopover
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
