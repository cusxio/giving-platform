import { Link } from '@tanstack/react-router'

import { Logo } from '#/core/brand/logo'

import { Button } from './ui/button'

export function HeaderLogo() {
  return (
    <header className="flex h-14 items-center justify-center px-4">
      <nav>
        <Button
          className="p-4"
          render={
            <Link aria-label="Collective" to="/">
              <Logo className="w-24 fill-current" />
            </Link>
          }
        />
      </nav>
    </header>
  )
}
