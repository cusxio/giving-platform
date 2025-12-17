import type { MenuProps as AriakitMenuProps } from '@ariakit/react'
import { Menu as AriakitMenu } from '@ariakit/react'

import { cx } from '#/styles/cx'

interface MenuProps extends Omit<
  AriakitMenuProps,
  'portal' | 'unmountOnHide'
> {}

export function Menu(props: MenuProps) {
  const { className, ...rest } = props

  return (
    <AriakitMenu
      className={cx(
        'z-20 p-1',
        'min-w-60 border border-border bg-base-1',
        'scale-95 opacity-0',
        'origin-(--popover-transform-origin)',
        'transition duration-150 ease-out',
        'data-enter:scale-100 data-enter:opacity-100',
        'data-leave:duration-100 data-leave:ease-in',
        className,
      )}
      portal
      unmountOnHide
      {...rest}
    />
  )
}
