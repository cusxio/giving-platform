import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import {
  createUserQueryOptions,
  useAuthUser,
} from '#/features/session/session.queries'

import { AsideNav } from './-components/aside-nav'
import { Header } from './-components/header'

export const Route = createFileRoute('/(app)')({
  component: RouteComponent,

  async beforeLoad({ context }) {
    const { queryClient } = context

    const result = await queryClient.ensureQueryData(createUserQueryOptions())

    if (result.type === 'AUTH_ERROR') {
      throw redirect({ to: '/auth/login' })
    }

    if (result.value.user.journey === null) {
      throw redirect({ to: '/' })
    }

    return result.value
  },
})

function RouteComponent() {
  const { user, userSettings } = useAuthUser()

  return (
    <>
      <Header user={user} userSettings={userSettings} />
      <Outlet />
      <AsideNav user={user} />
    </>
  )
}
