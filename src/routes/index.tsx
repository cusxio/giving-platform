import { BarricadeIcon } from '@phosphor-icons/react/dist/ssr'
import { createFileRoute, redirect } from '@tanstack/react-router'

import { FooterCopyright } from '#/components/footer-copyright'
import { HeaderLogo } from '#/components/header-logo'
import {
  createUserQueryOptions,
  useOptionalAuthUser,
} from '#/features/session/session.queries'
import { Nav } from '#/routes/-components/nav'
import { cx } from '#/styles/cx'

import { GivingForm } from './-components/giving-form/giving-form'

export const Route = createFileRoute('/')({
  async beforeLoad({ context }) {
    if (process.env.MAINTENANCE_MODE === 'true') {
      return { isMaintenanceMode: true }
    }

    const result = await context.queryClient.ensureQueryData(
      createUserQueryOptions(),
    )

    if (result.type === 'SUCCESS' && result.value.user.journey === null) {
      throw redirect({ to: '/welcome', replace: true })
    }

    return { isMaintenanceMode: false }
  },

  component: RouteComponent,
})

function IndexContent() {
  const authUser = useOptionalAuthUser()
  const user = authUser?.user

  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 items-center justify-center bg-base-1/60 px-4 backdrop-blur-sm">
        <div className="w-full max-w-5xl">
          <Nav isAuthenticated={user ? true : false} />
        </div>
      </header>

      <main className="flex shrink-0 grow flex-col items-center justify-center px-4">
        <div className="w-full max-w-118 pt-12 pb-24">
          <GivingForm user={user} />
        </div>
      </main>

      <FooterCopyright />
    </>
  )
}

function RouteComponent() {
  const { isMaintenanceMode } = Route.useRouteContext()

  if (isMaintenanceMode) {
    return (
      <>
        <HeaderLogo />
        <main className="-mt-14 flex shrink-0 grow flex-col items-center justify-center gap-y-4 px-4">
          <span
            className={cx(
              'flex h-16 w-16 items-center justify-center rounded-full',
              'bg-base-warning text-fg-warning',
            )}
          >
            <BarricadeIcon size={32} />
          </span>
          <h1 className="mt-4 text-center text-4xl font-bold text-balance">
            We’ll Be Right Back
          </h1>

          <p className="text-center text-balance text-fg-muted">
            We’re performing scheduled maintenance to improve performance and
            reliability. Thanks for your patience.
          </p>
        </main>
      </>
    )
  }

  return <IndexContent />
}
