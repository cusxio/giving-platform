import { Dialog, useDialogStore } from '@ariakit/react'
import {
  ChartLineIcon,
  ChartLineUpIcon,
  GearIcon,
  HandHeartIcon,
  InvoiceIcon,
  ReceiptIcon,
} from '@phosphor-icons/react/dist/ssr'
import { useMemo } from 'react'

import { Logo } from '#/core/brand/logo'
import type { User } from '#/db/schema'
import { cx } from '#/styles/cx'

import { AsideNavButton } from './aside-nav-button'
import type { AsideNavItemProps } from './aside-nav-item'
import { AsideNavItem } from './aside-nav-item'
import { useAsideNavStore } from './use-aside-nav-store'

interface AsideNavProps {
  user: Pick<User, 'role'>
}

export function AsideNav(props: AsideNavProps) {
  const { user } = props
  const open = useAsideNavStore((state) => state.open)
  const toggle = useAsideNavStore((state) => state.toggle)
  const store = useDialogStore({ open, setOpen: toggle })

  const navItems: AsideNavItemProps[] = useMemo(() => {
    const baseNavItems: AsideNavItemProps[] = [
      { to: '/overview', name: 'Overview', icon: ChartLineIcon },
      { to: '/transactions', name: 'Transactions', icon: ReceiptIcon },
      { to: '/', name: 'Give', icon: HandHeartIcon },
      { to: '/settings', name: 'Settings', icon: GearIcon },
    ]

    if (user.role === 'su') {
      baseNavItems.push(
        { name: 'Insights', to: '/insights', icon: ChartLineUpIcon },
        { name: 'Reports', to: '/reports', icon: InvoiceIcon },
      )
    }

    return baseNavItems
  }, [user.role])

  return (
    <Dialog
      backdrop={
        <div
          className={cx(
            'opacity-0 backdrop-blur-none',
            'transition duration-150 ease-out',
            'data-enter:opacity-100 data-enter:backdrop-blur-sm',
            'data-leave:duration-100 data-leave:ease-in',
          )}
        />
      }
      className={cx(
        'w-52 bg-base-1',
        'fixed top-0 bottom-0 left-0 z-20',
        'border-r border-r-border',
        'transition-transform duration-150 ease-out',
        '-translate-x-full',
        'data-enter:translate-x-0',
        'data-leave:duration-100 data-leave:ease-in',
      )}
      preventBodyScroll
      store={store}
      unmountOnHide
    >
      <aside>
        <div className="flex h-12 items-center justify-between border-b border-b-border px-4">
          <Logo className="w-24 fill-current" />
          <div className="-mr-2.5">
            <AsideNavButton />
          </div>
        </div>

        <nav className="flex flex-col gap-y-4 p-3">
          {navItems.map((item) => (
            <AsideNavItem key={item.name} {...item} />
          ))}
        </nav>
      </aside>
    </Dialog>
  )
}
