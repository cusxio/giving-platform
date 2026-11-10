import { BarricadeIcon } from '@phosphor-icons/react/dist/ssr'
import { createFileRoute, redirect } from '@tanstack/react-router'

import { FooterCopyright } from '#/components/footer-copyright'
import { HeaderLogo } from '#/components/header-logo'
import { currentUserQuery, useOptionalAuthUser } from '#/modules/account'
import { savedPaymentMethodsQuery } from '#/modules/payments'
import { Nav } from '#/routes/-components/nav'
import { cx } from '#/styles/cx'

import { GivingForm } from './-components/giving-form/giving-form'
import { linkedGift, opensOnDetails, parseFundSearch } from './-hooks/fund-search'
import { useGivingUrl } from './-hooks/use-giving-url'

export const Route = createFileRoute('/')({
  async beforeLoad({ context, search }) {
    if (context.isMaintenanceMode) {
      return { isAuthenticated: false, isMaintenanceMode: true }
    }

    const result = await context.queryClient.query({ ...currentUserQuery(), staleTime: 'static' })

    if (result.type === 'SUCCESS' && result.value.user.journey === null) {
      throw redirect({ replace: true, to: '/welcome' })
    }

    const isAuthenticated = result.type === 'SUCCESS'

    return {
      isAuthenticated,
      isMaintenanceMode: false,
      shouldPreloadPaymentMethods: isAuthenticated && opensOnDetails(linkedGift(search)),
    }
  },

  component: RouteComponent,

  async loader({ context }) {
    if (context.shouldPreloadPaymentMethods === true) {
      await context.queryClient.query({ ...savedPaymentMethodsQuery(true), staleTime: 'static' })
    }
  },

  validateSearch: parseFundSearch,
})

function IndexContent() {
  const authUser = useOptionalAuthUser()
  const user = authUser?.user
  const { gift, setFundsInUrl, clearUrl } = useGivingUrl()

  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 items-center justify-center bg-base-1/60 px-4 backdrop-blur-sm">
        <div className="w-full max-w-5xl">
          <Nav isAuthenticated={user !== undefined} />
        </div>
      </header>

      <main className="flex shrink-0 grow flex-col items-center justify-center px-4">
        <div className="w-full max-w-118 pt-12 pb-24">
          <GivingForm
            gift={gift}
            initialView={opensOnDetails(gift) ? 'details' : 'amounts'}
            onBack={clearUrl}
            onContinue={setFundsInUrl}
            user={user}
          />
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
          <h1 className="mt-4 text-center text-4xl font-bold text-balance">We’ll Be Right Back</h1>

          <p className="text-center text-balance text-fg-muted">
            We’re performing scheduled maintenance to improve performance and reliability. Thanks
            for your patience.
          </p>
        </main>
      </>
    )
  }

  return <IndexContent />
}
