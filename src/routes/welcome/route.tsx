import { createFileRoute, redirect } from '@tanstack/react-router'

import { config } from '#/core/brand'
import { useSuspenseQueryDeferred } from '#/hooks'

import { useWelcomeViewStore } from './-components/use-welcome-view-store'
import { WelcomeDone } from './-components/welcome-done'
import { WelcomeForm } from './-components/welcome-form'
import { WelcomeIntro } from './-components/welcome-intro'
import { WelcomeMigrate } from './-components/welcome-migrate'
import { createWelcomeQueryOptions } from './-welcome.queries'

export const Route = createFileRoute('/welcome')({
  async loader({ context }) {
    const { user } = await context.queryClient.ensureQueryData(
      createWelcomeQueryOptions(),
    )

    if (user.journey !== null) {
      throw redirect({ to: '/', replace: true })
    }
  },

  component: RouteComponent,

  head: () => ({ meta: [{ title: `Welcome · ${config.entity}` }] }),
})

function RouteComponent() {
  const { data } = useSuspenseQueryDeferred(createWelcomeQueryOptions())
  const { user, guestTransactionExists } = data
  const view = useWelcomeViewStore((state) => state.view)

  return (
    <div className="flex shrink-0 grow items-center justify-center px-4">
      <div className="flex w-full max-w-3xl flex-col items-center gap-y-8">
        {view === 'intro' && <WelcomeIntro />}

        {view === 'form' && (
          <WelcomeForm
            guestTransactionExists={guestTransactionExists}
            user={user}
          />
        )}

        {view === 'migrate' && <WelcomeMigrate />}

        {view === 'done' && <WelcomeDone />}
      </div>
    </div>
  )
}
