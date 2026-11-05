import type * as ReactQuery from '@tanstack/react-query'
import { MutationObserver, QueryClient } from '@tanstack/react-query'
import type * as ReactRouter from '@tanstack/react-router'
import type * as Start from '@tanstack/react-start'
import { describe, expect, it, vi } from 'vitest'

import type * as Functions from './auth.functions'

const server = vi.hoisted(() => ({
  logout: vi.fn<() => Promise<unknown>>(),
  verifyOtp: vi.fn<(call: { data: unknown }) => Promise<unknown>>(),
}))
const cache = vi.hoisted(() => ({ client: undefined as unknown }))

vi.mock<typeof Functions>(import('./auth.functions'), () => server as unknown as typeof Functions)
vi.mock<typeof Start>(import('@tanstack/react-start'), () => ({
  useServerFn: ((fn: unknown) => fn) as typeof Start.useServerFn,
}))
vi.mock<typeof ReactRouter>(import('@tanstack/react-router'), async (actual) => ({
  ...(await actual()),
  useRouter: (() => ({ clearCache() {} })) as unknown as typeof ReactRouter.useRouter,
}))
vi.mock<typeof ReactQuery>(import('@tanstack/react-query'), async (actual) => ({
  ...(await actual()),
  useMutation: ((options: unknown) => options) as unknown as typeof ReactQuery.useMutation,
  useQueryClient: (() => cache.client) as typeof ReactQuery.useQueryClient,
}))

const { useLogoutMutation, useVerifyOtpMutation } = await import('./auth.queries')

function cacheOfPreviousSession() {
  const client = new QueryClient()
  client.setQueryData(['auth-user'], { type: 'SUCCESS', value: { user: { id: 1 } } })
  client.setQueryData(['saved-payment-methods', { authenticated: true }], [{ id: 'card-of-1' }])
  cache.client = client
  return client
}

function mutate(options: unknown, input?: unknown) {
  const observer = new MutationObserver(cache.client as QueryClient, options as never)
  return observer.mutate(input as never)
}

const cachedKeys = (client: QueryClient) =>
  client
    .getQueryCache()
    .getAll()
    .map((query) => query.queryKey)

const code = { email: 'b@example.test', mode: 'login', otp: '123456' }

describe('the cache across sessions', () => {
  it('forgets the previous session once a sign-in succeeds', async () => {
    expect.hasAssertions()
    const client = cacheOfPreviousSession()
    server.verifyOtp.mockResolvedValueOnce({ type: 'SUCCESS', value: undefined })

    await mutate(useVerifyOtpMutation(), code)

    expect(cachedKeys(client)).toStrictEqual([])
  })

  it.each([
    { error: { code: 'INVALID_OR_EXPIRED_OTP' }, type: 'BUSINESS_ERROR' },
    { type: 'SERVER_ERROR' },
  ])('keeps it after a sign-in answered $type', async (response) => {
    expect.hasAssertions()
    const client = cacheOfPreviousSession()
    server.verifyOtp.mockResolvedValueOnce(response)

    await mutate(useVerifyOtpMutation(), code)

    expect(cachedKeys(client)).toHaveLength(2)
  })

  it('forgets the session on logout', async () => {
    expect.hasAssertions()
    const client = cacheOfPreviousSession()
    server.logout.mockResolvedValueOnce({ type: 'SUCCESS' })

    await mutate(useLogoutMutation())

    expect(cachedKeys(client)).toStrictEqual([])
  })
})
