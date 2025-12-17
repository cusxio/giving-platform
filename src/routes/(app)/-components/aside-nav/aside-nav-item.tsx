import { Button } from '@ariakit/react'
import type { Icon } from '@phosphor-icons/react'
import type { LinkProps } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'
import { createElement } from 'react'

import { cx } from '#/styles/cx'

import { useAsideNavStore } from './use-aside-nav-store'

export interface AsideNavItemProps extends Pick<LinkProps, 'to'> {
  icon: Icon
  name: string
}

export function AsideNavItem(props: AsideNavItemProps) {
  const { to, icon, name } = props

  const toggle = useAsideNavStore((state) => state.toggle)
  return (
    <Button
      className={cx(
        'inline-flex items-center px-3 select-none',
        'h-10 text-fg-subtle',
        'border border-transparent transition-colors',
        'data-[status=active]:border-border data-[status=active]:bg-surface data-[status=active]:text-fg-default',
        'hover:text-fg-default',
      )}
      render={
        <Link
          onClick={() => {
            toggle(false)
          }}
          to={to}
        >
          {createElement(icon, { size: 20 })}
          <span className="ml-3 text-sm">{name}</span>
        </Link>
      }
    />
  )
}
