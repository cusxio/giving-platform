import { describe, expect, it } from 'vitest'

import { constantTimeEqual } from './constant-time-equal'

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
