import type * as Sonner from 'sonner'
import { describe, expect, it, vi } from 'vitest'

const sonnerCode = vi.hoisted(() => ({ failures: 0, loaded: false }))

async function sonnerModule(actual: () => Promise<typeof Sonner>) {
  if (sonnerCode.failures > 0) {
    sonnerCode.failures -= 1
    throw new TypeError('Failed to fetch dynamically imported module')
  }
  sonnerCode.loaded = true
  return actual()
}

vi.mock(import('sonner'), sonnerModule)

const { toast } = await import('./index')

/** What the Toaster renders once it mounts: sonner replays its active toasts to a new Toaster. */
async function shown() {
  const sonner = await import('sonner')
  return sonner.toast.getToasts().map((t) => ('title' in t ? [t.type, t.title, t.description] : t))
}

describe('toast', () => {
  it('shows every call made before the toast code loaded, in order', async () => {
    expect.hasAssertions()
    expect(sonnerCode.loaded).toBe(false)

    toast.error('Saved Card Unavailable', { description: 'Pick another card.' })
    toast.success('Saved!')
    toast.unexpected()

    await vi.waitFor(async () => {
      await expect(shown()).resolves.toHaveLength(3)
    })
    await expect(shown()).resolves.toStrictEqual([
      ['error', 'Saved Card Unavailable', 'Pick another card.'],
      ['success', 'Saved!', undefined],
      ['error', 'Something unexpected has occurred.', 'Please try again later.'],
    ])
  })

  it('shows a toast called after the toast code failed to load', async () => {
    expect.hasAssertions()
    sonnerCode.failures = 1
    vi.resetModules()
    vi.doMock(import('sonner'), sonnerModule)
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fresh = await import('./index')

    fresh.toast.error('Lost while the toast code failed to load')
    await vi.waitFor(() => {
      expect(reported.mock.calls).toStrictEqual([
        ['Could not load the toast code', expect.any(Error)],
      ])
    })
    fresh.toast.success('Shown once the toast code loads')

    await vi.waitFor(async () => {
      await expect(shown()).resolves.toContainEqual([
        'success',
        'Shown once the toast code loads',
        undefined,
      ])
    })
  })
})
