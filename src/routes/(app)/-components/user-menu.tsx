import type { MenuStore } from '@ariakit/react'
import { Link } from '@tanstack/react-router'

import { Menu, MenuItem, MenuSeparator } from '#/components/ui/menu'
import type { User } from '#/db/schema'
import { useLogoutMutation } from '#/features/auth/auth.mutations'

interface UserMenuProps {
  store: MenuStore
  user: Pick<User, 'email' | 'firstName' | 'lastName'>
}

export function UserMenu(props: UserMenuProps) {
  const { store, user } = props

  const logout = useLogoutMutation()

  return (
    <Menu store={store}>
      <div className="grid px-2 py-1.5">
        <span className="text-sm">
          {user.firstName} {user.lastName}
        </span>
        <span className="text-xs text-fg-muted">{user.email}</span>
      </div>

      <MenuSeparator />

      <MenuItem render={<Link to="/settings">Settings</Link>} />

      <MenuSeparator />
      <MenuItem
        onClick={() => {
          logout.mutate()
        }}
        store={store}
      >
        Sign out
      </MenuItem>
    </Menu>
  )
}
