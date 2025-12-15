import { useMenuStore } from '@ariakit/react'
import { useMatches } from '@tanstack/react-router'

import { Button } from '#/components/ui/button'
import { MenuButton } from '#/components/ui/menu'
import type { User, UserSettings } from '#/db/schema'

import { AsideNavButton } from './aside-nav'
import { HeaderPrivacyToggle } from './header-privacy-toggle'
import { UserMenu } from './user-menu'

interface HeaderProps {
  user: Pick<User, 'email' | 'firstName' | 'lastName'>
  userSettings: Pick<UserSettings, 'privacyMode'>
}

export function Header(props: HeaderProps) {
  const { user, userSettings } = props

  const store = useMenuStore()
  const showPrivacyToggle = useMatches().some((match) => {
    return ['/(app)/overview', '/(app)/transactions'].includes(match.routeId)
  })

  return (
    <>
      <header className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-border bg-base-1/80 px-4 backdrop-blur-sm">
        <AsideNavButton />

        <div className="flex items-center gap-x-2">
          {showPrivacyToggle && (
            <HeaderPrivacyToggle userSettings={userSettings} />
          )}

          <MenuButton
            className="h-10 w-10"
            render={(props) => <Button {...props} />}
            store={store}
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-elevated">
              {user.firstName?.charAt(0) ?? user.lastName?.charAt(0)}
            </span>
          </MenuButton>
        </div>
      </header>
      <UserMenu store={store} user={user} />
    </>
  )
}
