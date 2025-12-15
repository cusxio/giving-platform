import { MenuItem as AriakitMenuItem } from '@ariakit/react'
import type { MenuItemProps as AriakitMenuItemProps } from '@ariakit/react'

import { cx } from '#/styles/cx'

interface MenuItemProps extends AriakitMenuItemProps {}

export function MenuItem(props: MenuItemProps) {
  const { className, ...rest } = props
  return (
    <AriakitMenuItem
      className={cx(
        'flex',
        'px-2 py-1.5 text-sm',
        'transition-colors',
        'hover:bg-elevated',
        'cursor-pointer select-none',
        className,
      )}
      {...rest}
    />
  )
}
