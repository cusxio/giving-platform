import { ArrowRightIcon } from '@phosphor-icons/react/dist/ssr'
import { Link } from '@tanstack/react-router'

import { Logo } from '#/core/brand/logo'
import { cx } from '#/styles/cx'

import { Button, buttonVariants } from '../../components/ui/button'

interface NavProps {
  isAuthenticated: boolean
}

export function Nav(props: NavProps) {
  const { isAuthenticated } = props
  return (
    <nav className="flex justify-between">
      <Link className="-ml-4 p-4" to="/">
        <Logo className="w-20 fill-current sm:w-24" />
      </Link>

      <div className="flex items-center gap-x-1 sm:gap-x-2">
        {isAuthenticated ? (
          <Button
            className={cx(buttonVariants.subtle, 'h-8 gap-2')}
            render={
              <Link to="/overview">
                <span>Overview</span>
                <ArrowRightIcon />
              </Link>
            }
          />
        ) : (
          <>
            <Button
              className="h-8 px-2 text-sm text-fg-subtle transition-colors hover:text-fg-default"
              render={<Link to="/auth/login">Login</Link>}
            />
            <Button
              className={cx(buttonVariants.subtle, 'h-8')}
              render={<Link to="/welcome/signup">Sign up</Link>}
            />
          </>
        )}
      </div>
    </nav>
  )
}
