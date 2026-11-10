import type * as ReactQuery from '@tanstack/react-query'
import { MutationObserver, queryOptions } from '@tanstack/react-query'
import type * as ReactRouter from '@tanstack/react-router'
import { createMemoryHistory } from '@tanstack/react-router'
import type * as Start from '@tanstack/react-start'
import { describe, expect, it, vi } from 'vitest'

import { clientTz, now } from '#/core/date'
import type * as Account from '#/modules/account'
import type * as History from '#/modules/history'
import { getRouter } from '#/router'

import type * as Functions from './auth.functions'

type Donor = 'A' | 'B'
type Router = ReturnType<typeof getRouter>

const thisYear = now(clientTz).getFullYear()
const ids = { A: 1, B: 2 } as const
const yearsWithData = new Map<number, number[]>([
  [ids.A, [thisYear, thisYear - 1]],
  [ids.B, []],
])

const server = vi.hoisted(() => ({
  hasSession: vi.fn<() => Promise<boolean>>(),
  logout: vi.fn<() => Promise<unknown>>(),
  signedIn: undefined as Donor | undefined,
  verifyOtp: vi.fn<() => Promise<unknown>>(),
}))
const app = vi.hoisted(() => ({ router: undefined as unknown as Router }))

vi.mock<typeof Functions>(
  import('./auth.functions'),
  () =>
    ({
      hasSession: () => Promise.resolve(server.signedIn !== undefined),
      logout: server.logout,
      verifyOtp: server.verifyOtp,
    }) as unknown as typeof Functions,
)
vi.mock<typeof Start>(import('@tanstack/react-start'), async (actual) => ({
  ...(await actual()),
  useServerFn: ((fn: unknown) => fn) as typeof Start.useServerFn,
}))
vi.mock<typeof ReactQuery>(import('@tanstack/react-query'), async (actual) => ({
  ...(await actual()),
  useMutation: ((options: unknown) => options) as unknown as typeof ReactQuery.useMutation,
  useQueryClient: () => app.router.options.context.queryClient,
}))
vi.mock<typeof ReactRouter>(import('@tanstack/react-router'), async (actual) => ({
  ...(await actual()),
  useRouter: (() => app.router) as typeof ReactRouter.useRouter,
}))
vi.mock<typeof Account>(import('#/modules/account'), async (actual) => {
  const account = await actual()
  return {
    ...account,
    currentUserQuery: () =>
      queryOptions({
        ...account.currentUserQuery(),
        queryFn: () =>
          Promise.resolve(
            server.signedIn === undefined
              ? { type: 'AUTH_ERROR' }
              : {
                  type: 'SUCCESS',
                  value: {
                    user: { id: ids[server.signedIn], journey: 'migrate' },
                    userSettings: {},
                  },
                },
          ) as never,
      }),
  }
})
vi.mock<typeof History>(import('#/modules/history'), async (actual) => {
  const history = await actual()
  return {
    ...history,
    availableYearsQuery: (userId, journey) =>
      queryOptions({
        ...history.availableYearsQuery(userId, journey),
        queryFn: () => Promise.resolve(yearsWithData.get(userId) ?? []),
      }),
    overviewQuery: (userId, journey, year) =>
      queryOptions({
        ...history.overviewQuery(userId, journey, year),
        queryFn: () => Promise.resolve({ transactions: [] }) as never,
      }),
  }
})

const { useLogoutMutation, useVerifyOtpMutation } = await import('./auth.queries')

function mutate(options: unknown) {
  const observer = new MutationObserver(app.router.options.context.queryClient, options as never)
  return observer.mutate()
}

const overviewShown = (router: Router) =>
  router.state.matches.find((match) => match.routeId === '/(app)/overview')?.loaderData

const overviewOfA = {
  hasZeroTransactions: false,
  year: thisYear,
  years: ['all', thisYear, thisYear - 1],
}
const overviewOfB = { hasZeroTransactions: true, year: thisYear, years: [thisYear] }

async function onOverviewAs(donor: Donor) {
  server.signedIn = donor
  const router = getRouter()
  router.update({
    ...router.options,
    history: createMemoryHistory({ initialEntries: ['/overview'] }),
    isServer: false,
    origin: 'http://localhost',
    scrollRestoration: false,
  })
  app.router = router
  await router.load()
  expect(overviewShown(router)).toStrictEqual(overviewOfA)
  return router
}

describe('the overview after another donor used the tab', () => {
  it('shows the next donor their own years after a logout', async () => {
    expect.hasAssertions()
    const router = await onOverviewAs('A')
    server.logout.mockImplementationOnce(async () => {
      server.signedIn = undefined
      await router.navigate({ replace: true, to: '/auth/login' })
    })

    await mutate(useLogoutMutation())
    server.signedIn = 'B'
    await router.navigate({ to: '/overview' })

    expect(overviewShown(router)).toStrictEqual(overviewOfB)
  })

  it('shows the next donor their own years after a sign-in that follows an ended session', async () => {
    expect.hasAssertions()
    const router = await onOverviewAs('A')
    server.signedIn = undefined
    await router.navigate({ to: '/auth/login' })
    server.verifyOtp.mockImplementationOnce(() => {
      server.signedIn = 'B'
      return Promise.resolve({ type: 'SUCCESS', value: undefined })
    })

    await mutate(useVerifyOtpMutation())
    await router.navigate({ to: '/overview' })

    expect(overviewShown(router)).toStrictEqual(overviewOfB)
  })
})
