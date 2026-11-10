import type * as ReactQuery from '@tanstack/react-query'
import { MutationObserver, QueryClient, QueryObserver } from '@tanstack/react-query'
import type * as Router from '@tanstack/react-router'
import { describe, expect, it, vi } from 'vitest'

import type * as Toaster from '#/components/ui/toaster'

import type * as Functions from './account.functions'
import type { CurrentUserResponse } from './account.types'

const server = vi.hoisted(() => ({
  getCurrentUser: vi.fn<() => Promise<unknown>>(),
  updatePrivacyMode: vi.fn<(call: { data: unknown }) => Promise<unknown>>(),
  updateUser: vi.fn<(call: { data: unknown }) => Promise<unknown>>(),
}))
const navigate = vi.hoisted(() => vi.fn<(to: unknown) => Promise<void>>())
const cache = vi.hoisted(() => ({ client: undefined as unknown }))

vi.mock<typeof Functions>(
  import('./account.functions'),
  () => server as unknown as typeof Functions,
)
vi.mock<typeof Router>(import('@tanstack/react-router'), () => ({
  useNavigate: (() => navigate) as unknown as typeof Router.useNavigate,
}))
vi.mock<typeof ReactQuery>(import('@tanstack/react-query'), async (actual) => ({
  ...(await actual()),
  useMutation: ((options: unknown) => options) as unknown as typeof ReactQuery.useMutation,
  useQueryClient: (() => cache.client) as typeof ReactQuery.useQueryClient,
}))
vi.mock<typeof Toaster>(import('#/components/ui/toaster'), () => ({
  toast: { error: vi.fn<() => void>(), unexpected: vi.fn<() => void>() } as never,
}))

const { currentUserQuery, useUpdatePrivacyModeMutation, useUpdateUserMutation, welcomeQuery } =
  await import('./account.queries')

const signedIn = {
  type: 'SUCCESS',
  value: {
    user: { firstName: 'Old', id: 1, journey: null, lastName: 'Name' },
    userSettings: { privacyMode: false, userId: 1 },
  },
}

function freshCache() {
  const client = new QueryClient()
  client.setQueryData(currentUserQuery().queryKey, signedIn as never)
  cache.client = client
  return client
}

function mutate(options: unknown, input: unknown) {
  const observer = new MutationObserver(cache.client as QueryClient, options as never)
  return observer.mutate(input as never)
}

const privacyOf = (client: QueryClient) =>
  (client.getQueryData(currentUserQuery().queryKey) as typeof signedIn).value.userSettings
    .privacyMode

function mountHeaderUserQuery(client: QueryClient) {
  const observer = new QueryObserver(client, { ...currentUserQuery(), staleTime: Infinity })
  return observer.subscribe(() => {})
}

const loadUser = () => currentUserQuery().queryFn?.({} as never)
const save = (data: { firstName: string }) => {
  const { mutationFn } = useUpdateUserMutation() as unknown as {
    mutationFn: (input: typeof data) => Promise<unknown>
  }
  return mutationFn(data)
}

describe('currentUserQuery', () => {
  it('throws on SERVER_ERROR, so the failure is not cached as the user', async () => {
    expect.hasAssertions()
    server.getCurrentUser.mockResolvedValueOnce({ type: 'SERVER_ERROR' })

    await expect(loadUser()).rejects.toThrow('Could not load the current user')
  })

  it.each<CurrentUserResponse>([
    { type: 'AUTH_ERROR' },
    {
      type: 'SUCCESS',
      value: { user: { id: 1 }, userSettings: { privacyMode: false } },
    } as unknown as CurrentUserResponse,
  ])('answers $type as it came', async (response) => {
    expect.hasAssertions()
    server.getCurrentUser.mockResolvedValueOnce(response)

    await expect(loadUser()).resolves.toStrictEqual(response)
  })
})

describe('useUpdateUserMutation', () => {
  it('sends a signed-out caller to login and resolves undefined', async () => {
    expect.hasAssertions()
    navigate.mockClear()
    server.updateUser.mockResolvedValueOnce({
      message: 'You must be logged in to continue.',
      type: 'AUTH_ERROR',
    })

    await expect(save({ firstName: 'Ada' })).resolves.toBeUndefined()
    expect(server.updateUser).toHaveBeenLastCalledWith({ data: { firstName: 'Ada' } })
    expect(navigate.mock.calls).toStrictEqual([[{ to: '/auth/login' }]])
  })

  it.each([
    { type: 'SERVER_ERROR' },
    { errors: [{ message: 'required', path: '/firstName' }], type: 'VALIDATION_ERROR' },
    { type: 'SUCCESS', value: { user: { firstName: 'Ada' } } },
  ])('answers $type without navigating', async (response) => {
    expect.hasAssertions()
    navigate.mockClear()
    server.updateUser.mockResolvedValueOnce(response)

    await expect(save({ firstName: 'Ada' })).resolves.toStrictEqual(response)
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('a saved profile in the cache', () => {
  const saved = { firstName: 'Ada', id: 1, journey: 'migrate', lastName: 'Lovelace' }

  it('shows at once wherever the user is cached', async () => {
    expect.hasAssertions()
    const client = freshCache()
    client.setQueryData(welcomeQuery().queryKey, {
      guestTransactionExists: true,
      user: signedIn.value.user,
    } as never)
    server.updateUser.mockResolvedValueOnce({ type: 'SUCCESS', value: { user: saved } })

    await mutate(useUpdateUserMutation(), { firstName: 'Ada', journey: 'migrate' })

    expect(client.getQueryData(currentUserQuery().queryKey)).toStrictEqual({
      type: 'SUCCESS',
      value: { user: saved, userSettings: signedIn.value.userSettings },
    })
    expect(client.getQueryData(welcomeQuery().queryKey)).toStrictEqual({
      guestTransactionExists: true,
      user: saved,
    })
  })

  it.each([{ type: 'SERVER_ERROR' }, { message: 'Signed out', type: 'AUTH_ERROR' }])(
    'stays as it was after $type',
    async (response) => {
      expect.hasAssertions()
      const client = freshCache()
      server.updateUser.mockResolvedValueOnce(response)

      await mutate(useUpdateUserMutation(), { firstName: 'Ada' })

      expect(client.getQueryData(currentUserQuery().queryKey)).toStrictEqual(signedIn)
    },
  )
})

describe('a privacy toggle in the cache', () => {
  it('shows at once, then settles on what the server reads back', async () => {
    expect.hasAssertions()
    const client = freshCache()
    const unmount = mountHeaderUserQuery(client)
    const answer: { saved?: (response: unknown) => void } = {}
    server.updatePrivacyMode.mockReturnValueOnce(
      new Promise((resolve) => {
        answer.saved = resolve
      }),
    )
    server.getCurrentUser
      .mockReset()
      .mockResolvedValue({
        ...signedIn,
        value: { ...signedIn.value, userSettings: { privacyMode: true, userId: 1 } },
      })

    const toggling = mutate(useUpdatePrivacyModeMutation(), true)
    await vi.waitFor(() => {
      expect(privacyOf(client)).toBe(true)
    })
    expect(server.getCurrentUser).not.toHaveBeenCalled()
    answer.saved?.({ type: 'SUCCESS', value: { privacyMode: true } })
    await toggling

    await vi.waitFor(() => {
      expect(server.getCurrentUser.mock.calls).toStrictEqual([[]])
    })
    expect(privacyOf(client)).toBe(true)
    unmount()
  })

  it('falls back to the server after a refused toggle', async () => {
    expect.hasAssertions()
    const client = freshCache()
    const unmount = mountHeaderUserQuery(client)
    server.updatePrivacyMode.mockResolvedValueOnce({ type: 'SERVER_ERROR' })
    server.getCurrentUser.mockReset().mockResolvedValue(signedIn)

    await mutate(useUpdatePrivacyModeMutation(), true)

    await vi.waitFor(() => {
      expect(server.getCurrentUser.mock.calls).toStrictEqual([[]])
    })
    await vi.waitFor(() => {
      expect(privacyOf(client)).toBe(false)
    })
    unmount()
  })
})
