import { QueryObserver } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { getRouter } from './router'

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
