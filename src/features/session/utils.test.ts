import { describe, expect, it } from 'vitest'

import { clearSessionCookie, serializeSessionCookie } from './utils'

describe('session cookie', () => {
  it('sets a lax, secure, http-only session cookie that expires with the session', () => {
    expect.hasAssertions()

    expect(
      serializeSessionCookie({
        cookieValue: 'token.session',
        expiresAt: new Date('2026-11-29T10:00:00Z'),
      }),
    ).toBe(
      '__session=token.session; Path=/; Expires=Sun, 29 Nov 2026 10:00:00 GMT; HttpOnly; Secure; SameSite=Lax',
    )
  })

  it('clears the session cookie by expiring it at the epoch', () => {
    expect.hasAssertions()

    expect(clearSessionCookie()).toBe(
      '__session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax',
    )
  })
})
