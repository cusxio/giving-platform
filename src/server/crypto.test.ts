import { describe, expect, it } from 'vitest'

import { constantTimeEqual, createTokenHasher } from './crypto.server'

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

describe('token hashing', () => {
  it('is a hex HMAC-SHA256 keyed by the secret', () => {
    expect.hasAssertions()

    const hashToken = createTokenHasher('test-session-secret')

    expect(hashToken('token'.padEnd(21, '0'))).toBe(
      '01a334f75a5b5120ae4910620d8916f187341c4b8b7f1d01c26f12c26727151b',
    )
    expect(createTokenHasher('another-secret')('token'.padEnd(21, '0'))).not.toBe(
      hashToken('token'.padEnd(21, '0')),
    )
  })
})
