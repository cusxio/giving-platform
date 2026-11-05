import { QueryObserver, queryOptions } from '@tanstack/react-query'
import { createMemoryHistory } from '@tanstack/react-router'
import { describe, expect, it, vi } from 'vitest'

import type * as Account from '#/modules/account'

import { getRouter } from './router'

const getCurrentUser = vi.hoisted(() => vi.fn<() => Promise<{ type: 'AUTH_ERROR' }>>())

vi.mock<typeof Account>(import('#/modules/account'), async (actual) => {
  const account = await actual()
  return {
    ...account,
    currentUserQuery: () =>
      queryOptions({ ...account.currentUserQuery(), queryFn: getCurrentUser }),
  }
})

async function fetchesOnMount(ageMs: number) {
  const { queryClient } = getRouter().options.context
  const queryKey = ['cached']
  queryClient.setQueryData(queryKey, 'cached', { updatedAt: Date.now() - ageMs })
  const queryFn = vi.fn<() => Promise<string>>().mockResolvedValue('fresh')

  const unmount = new QueryObserver(queryClient, { queryFn, queryKey }).subscribe(() => {})
  await vi.waitFor(() => {
    expect(queryClient.isFetching()).toBe(0)
  })
  unmount()

  return queryFn.mock.calls.length
}

describe('the router query cache', () => {
  it('shows data fetched in the last 30 seconds without fetching it again', async () => {
    expect.hasAssertions()

    await expect(fetchesOnMount(29_000)).resolves.toBe(0)
  })

  it('fetches data older than 30 seconds again', async () => {
    expect.hasAssertions()

    await expect(fetchesOnMount(31_000)).resolves.toBe(1)
  })
})

describe('maintenance mode', () => {
  it('shows the notice at / on a page the server rendered in maintenance, without asking for the user', async () => {
    expect.hasAssertions()

    getCurrentUser.mockReset().mockResolvedValue({ type: 'AUTH_ERROR' })
    const router = getRouter()
    router.update({ ...router.options, history: createMemoryHistory({ initialEntries: ['/'] }) })
    await router.options.hydrate?.({ isMaintenanceMode: true })

    await router.load()

    expect(router.state.matches.at(-1)?.context).toMatchObject({ isMaintenanceMode: true })
    expect(getCurrentUser).not.toHaveBeenCalled()
  })
})
