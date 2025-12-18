import { createFileRoute, redirect } from '@tanstack/react-router'

import { FooterCopyright } from '#/components/footer-copyright'
import { createUserQueryOptions } from '#/features/session/session.queries'
import { useSuspenseQueryDeferred } from '#/hooks'
import { Nav } from '#/routes/-components/nav'

import { GivingForm } from './-components/giving-form/giving-form'

export const Route = createFileRoute('/')({
  async beforeLoad({ context }) {
    const result = await context.queryClient.ensureQueryData(
      createUserQueryOptions(),
    )

    if (result.type === 'SUCCESS' && result.value.user.journey === null) {
      throw redirect({ to: '/welcome', replace: true })
    }
  },

  component: RouteComponent,
})

function RouteComponent() {
  const { data } = useSuspenseQueryDeferred(createUserQueryOptions())
  const userQueryResult = data.type === 'SUCCESS' ? data.value : undefined
  const user = userQueryResult?.user

  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 items-center justify-center bg-base-1/60 px-4 backdrop-blur-sm">
        <div className="w-full max-w-5xl">
          <Nav isAuthenticated={user ? true : false} />
        </div>
      </header>

      <div className="flex shrink-0 grow flex-col items-center justify-center px-4">
        <div className="w-full max-w-118 pt-12 pb-24">
          <GivingForm user={user} />
          okk
        </div>
      </div>

      <FooterCopyright />
    </>
  )
}
