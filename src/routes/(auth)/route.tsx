import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useMatch,
} from '@tanstack/react-router'

import { HeaderLogo } from '#/components/header-logo'
import { getSession } from '#/server/functions'
import { cx } from '#/styles/cx'

export const Route = createFileRoute('/(auth)')({
  async beforeLoad() {
    const session = await getSession()

    if (session !== null) {
      throw redirect({ to: '/', replace: true })
    }
  },

  component: RouteComponent,
})

function RouteComponent() {
  const match = useMatch({ from: '/(auth)/auth/login', shouldThrow: false })

  return (
    <>
      <HeaderLogo />

      <div className="flex flex-1 items-center justify-center px-4">
        <Outlet />
      </div>

      <footer className="flex h-14 items-center justify-center px-4">
        <p className={cx('text-center text-sm text-balance')}>
          {match === undefined ? (
            <>
              <span className="text-fg-subtle">Already have an account? </span>
              <Link className="hover:underline" to="/auth/login">
                Log in
              </Link>
              .
            </>
          ) : (
            <>
              <span className="text-fg-subtle">
                Don‘t have an account yet?{' '}
              </span>
              <Link className="hover:underline" to="/welcome/signup">
                Sign up
              </Link>
              .
            </>
          )}
        </p>
      </footer>
    </>
  )
}
