import type * as ReactQuery from '@tanstack/react-query'
import type * as Router from '@tanstack/react-router'
import { describe, expect, it, vi } from 'vitest'

import type * as Functions from './account.functions'
import type { CurrentUserResponse } from './account.types'

const server = vi.hoisted(() => ({
  getCurrentUser: vi.fn<() => Promise<unknown>>(),
  updateUser: vi.fn<(call: { data: unknown }) => Promise<unknown>>(),
}))
const navigate = vi.hoisted(() => vi.fn<(to: unknown) => Promise<void>>())

vi.mock<typeof Functions>(
  import('./account.functions'),
  () => server as unknown as typeof Functions,
)
vi.mock<typeof Router>(import('@tanstack/react-router'), () => ({
  useNavigate: (() => navigate) as unknown as typeof Router.useNavigate,
}))
// The hook's options are what it does: calling one outside React needs only `useMutation`'s input.
vi.mock<typeof ReactQuery>(import('@tanstack/react-query'), async (actual) => ({
  ...(await actual()),
  useMutation: ((options: unknown) => options) as unknown as typeof ReactQuery.useMutation,
}))

const { currentUserQuery, useUpdateUserMutation } = await import('./account.queries')

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
