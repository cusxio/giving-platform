import type { SetStateAction } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type * as Toaster from '#/components/ui/toaster'
import type { StartContributionResponse } from '#/features/giving/contribution.mutations'
import type * as ContributionMutations from '#/features/giving/contribution.mutations'

const toast = vi.hoisted(() => ({
  error: vi.fn<(message: string) => void>(),
  unexpected: vi.fn<() => void>(),
}))

vi.mock<typeof Toaster>(import('#/components/ui/toaster'), () => ({
  toast: toast as unknown as typeof Toaster.toast,
}))
vi.mock<typeof ContributionMutations>(import('#/features/giving/contribution.mutations'), () => ({
  useStartContributionMutation: vi.fn<typeof ContributionMutations.useStartContributionMutation>(),
}))

const { handleFormSubmission } = await import('./use-giving-form')

type Submission = Parameters<typeof handleFormSubmission>

const values = {
  email: 'donor@example.test',
  firstName: 'Ada',
  lastName: 'Lovelace',
  token: undefined,
} as unknown as Submission[0]

async function submit(
  respond: () => Promise<StartContributionResponse>,
  authenticated = false,
) {
  vi.clearAllMocks()
  const store = {
    names: { email: 'email' },
    setError: vi.fn<(name: string, error: unknown) => void>(),
    setFieldTouched: vi.fn<(name: string, touched: boolean) => void>(),
  }
  const setIsRedirecting = vi.fn<(value: SetStateAction<boolean>) => void>()

  await handleFormSubmission(
    values,
    { mutateAsync: respond } as unknown as Submission[1],
    store as unknown as Submission[2],
    setIsRedirecting,
    authenticated,
  )

  return {
    messages: {
      inline: store.setError.mock.calls.length,
      toastError: toast.error.mock.calls.length,
      toastUnexpected: toast.unexpected.mock.calls.length,
    },
    setIsRedirecting,
  }
}

describe('handleFormSubmission', () => {
  it.each(['EMAIL_EXISTS', 'USER_MISMATCH'] as const)(
    'shows only the inline error for business error %s',
    async (code) => {
      expect.hasAssertions()

      const { messages } = await submit(() =>
        Promise.resolve({ error: { code }, type: 'BUSINESS_ERROR' }),
      )

      expect(messages).toStrictEqual({ inline: 1, toastError: 0, toastUnexpected: 0 })
    },
  )

  it('shows only the invalid request toast for an INVALID_REQUEST business error', async () => {
    expect.hasAssertions()

    const { messages } = await submit(() =>
      Promise.resolve({ error: { code: 'INVALID_REQUEST' }, type: 'BUSINESS_ERROR' }),
    )

    expect(messages).toStrictEqual({ inline: 0, toastError: 1, toastUnexpected: 0 })
  })

  it('shows only an inline error for a validation error on a rendered guest field', async () => {
    expect.hasAssertions()

    const { messages } = await submit(() =>
      Promise.resolve({
        errors: [{ message: 'Required', path: '/firstName' }],
        type: 'VALIDATION_ERROR',
      }),
    )

    expect(messages).toStrictEqual({ inline: 1, toastError: 0, toastUnexpected: 0 })
  })

  it('shows one toast for a validation error when the user is signed in', async () => {
    expect.hasAssertions()

    const { messages } = await submit(
      () =>
        Promise.resolve({
          errors: [{ message: 'Too short', path: '/lastName' }],
          type: 'VALIDATION_ERROR',
        }),
      true,
    )

    expect(messages).toStrictEqual({ inline: 0, toastError: 1, toastUnexpected: 0 })
  })

  it.each(['/contributions/General', '/token', ''])(
    'shows one toast for a validation error on the non-field path %j',
    async (path) => {
      expect.hasAssertions()

      const { messages } = await submit(() =>
        Promise.resolve({ errors: [{ message: 'Invalid', path }], type: 'VALIDATION_ERROR' }),
      )

      expect(messages).toStrictEqual({ inline: 0, toastError: 1, toastUnexpected: 0 })
    },
  )

  it('shows one toast for several validation errors that have no rendered field', async () => {
    expect.hasAssertions()

    const { messages } = await submit(() =>
      Promise.resolve({
        errors: [
          { message: 'Invalid', path: '/contributions/General' },
          { message: 'Invalid', path: '/token' },
        ],
        type: 'VALIDATION_ERROR',
      }),
    )

    expect(messages).toStrictEqual({ inline: 0, toastError: 1, toastUnexpected: 0 })
  })

  it('shows one unexpected toast for a server error', async () => {
    expect.hasAssertions()

    const { messages } = await submit(() => Promise.resolve({ type: 'SERVER_ERROR' }))

    expect(messages).toStrictEqual({ inline: 0, toastError: 0, toastUnexpected: 1 })
  })

  it('shows one unexpected toast when the request throws', async () => {
    expect.hasAssertions()

    const { messages } = await submit(() => Promise.reject(new Error('network down')))

    expect(messages).toStrictEqual({ inline: 0, toastError: 0, toastUnexpected: 1 })
  })

  it('redirects without a message on success', async () => {
    expect.hasAssertions()

    const replace = vi.fn<(url: string) => void>()
    vi.stubGlobal('location', { replace })
    const { messages, setIsRedirecting } = await submit(() =>
      Promise.resolve({ type: 'SUCCESS', value: { redirectURL: 'https://pay.example.test' } }),
    )
    vi.unstubAllGlobals()

    expect(messages).toStrictEqual({ inline: 0, toastError: 0, toastUnexpected: 0 })
    expect(replace).toHaveBeenCalledWith('https://pay.example.test')
    expect(setIsRedirecting).toHaveBeenCalledWith(true)
  })
})
