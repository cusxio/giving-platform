import { describe, expect, it, vi } from 'vitest'

import type * as Toaster from '#/components/ui/toaster'
import type * as Account from '#/modules/account'

const toast = vi.hoisted(() => ({
  success: vi.fn<(message: string) => void>(),
  unexpected: vi.fn<() => void>(),
}))

vi.mock<typeof Toaster>(import('#/components/ui/toaster'), () => ({
  toast: toast as unknown as typeof Toaster.toast,
}))
vi.mock<typeof Account>(import('#/modules/account'), () => ({
  currentUserQuery: (() => ({
    queryKey: ['auth-user'],
  })) as unknown as typeof Account.currentUserQuery,
  useUpdateUserMutation: vi.fn<typeof Account.useUpdateUserMutation>(),
}))

const { saveSettings } = await import('./use-settings-form')

type Save = Parameters<typeof saveSettings>

async function save(respond: () => Promise<unknown>) {
  vi.clearAllMocks()
  const store = { setError: vi.fn<(name: string, error: string) => void>() }

  await saveSettings(
    { email: 'donor@example.test', firstName: 'Ada', lastName: 'Lovelace' },
    { mutateAsync: respond } as unknown as Save[1],
    { setQueryData: vi.fn<() => void>() } as unknown as Save[2],
    store as unknown as Save[3],
  )

  return {
    inline: store.setError.mock.calls,
    success: toast.success.mock.calls.length,
    unexpected: toast.unexpected.mock.calls.length,
  }
}

describe('saveSettings', () => {
  it('shows nothing for a signed-out save, which the mutation sends to login', async () => {
    expect.hasAssertions()

    await expect(save(() => Promise.resolve())).resolves.toStrictEqual({
      inline: [],
      success: 0,
      unexpected: 0,
    })
  })

  it('confirms a saved profile', async () => {
    expect.hasAssertions()

    await expect(
      save(() => Promise.resolve({ type: 'SUCCESS', value: { user: {} } })),
    ).resolves.toStrictEqual({ inline: [], success: 1, unexpected: 0 })
  })

  it('puts each validation error on its field', async () => {
    expect.hasAssertions()

    await expect(
      save(() =>
        Promise.resolve({
          errors: [{ message: 'must be shorter', path: '/firstName' }],
          type: 'VALIDATION_ERROR',
        }),
      ),
    ).resolves.toStrictEqual({
      inline: [['firstName', 'must be shorter']],
      success: 0,
      unexpected: 0,
    })
  })

  it.each([
    ['a server error', () => Promise.resolve({ type: 'SERVER_ERROR' })],
    ['a failed call', () => Promise.reject(new Error('offline'))],
  ])('shows the unexpected-error toast for %s', async (_case, respond) => {
    expect.hasAssertions()

    await expect(save(respond)).resolves.toStrictEqual({ inline: [], success: 0, unexpected: 1 })
  })
})
