import { describe, expect, it, vi } from 'vitest'

import { constantTimeEqual } from './crypto.server'

// hashToken shares this module and reads SESSION_SECRET at import.
vi.mock(import('#/server/env.server'), () => ({ SESSION_SECRET: 'test-session-secret' }))

describe('constant time comparison', () => {
  it('matches only identical strings', () => {
    expect.hasAssertions()

    expect(constantTimeEqual('3f2a9c', '3f2a9c')).toBe(true)
    expect(constantTimeEqual('3f2a9c', '3f2a9d')).toBe(false)
  })

  it('treats a length mismatch as unequal instead of throwing', () => {
    expect.hasAssertions()

    expect(constantTimeEqual('3f2a9c', '3f2a9c00')).toBe(false)
    expect(constantTimeEqual('3f2a9c', '')).toBe(false)
  })
})
