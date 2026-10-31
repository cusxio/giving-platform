import { describe, expect, it, vi } from 'vitest'

import { addDays, now } from '#/core/date'
import { ok } from '#/core/result'
import { createTokenHasher } from '#/server/crypto.server'
import type { Session, User } from '#/server/schema.server'

import type { SessionRepository } from './session.repository'
import { SessionService } from './session.service'
import { clearSessionCookie } from './utils'

vi.mock(import('#/server/env.server'), () => ({ SESSION_SECRET: 'test-session-secret' }))

const hashToken = createTokenHasher('test-session-secret')

type FakeUser = Pick<User, 'id' | 'journey' | 'role' | 'status'>

function setup(status: User['status']) {
  const user: FakeUser = { id: 1, journey: 'start_fresh', role: 'user', status }
  const sessionId = 'session'.padEnd(21, '0')
  const rawToken = 'token'.padEnd(21, '0')
  const sessions = new Map<Session['id'], Pick<Session, 'expiresAt' | 'id' | 'tokenHash'>>([
    [sessionId, { expiresAt: addDays(now(), 30), id: sessionId, tokenHash: hashToken(rawToken) }],
  ])

  const repository = {
    deleteSessionById: (id: Session['id']) => {
      sessions.delete(id)
      return Promise.resolve(ok())
    },
    extendSession: (id: Session['id'], expiresAt: Session['expiresAt']) => {
      const session = sessions.get(id)
      if (session) {
        session.expiresAt = expiresAt
      }
      return Promise.resolve(ok(session ?? null))
    },
    findSessionByIdWithUser: (id: Session['id']) => {
      const session = sessions.get(id)
      return Promise.resolve(ok(session ? { session: { ...session }, user: { ...user } } : null))
    },
  }

  return {
    cookieValue: `${sessionId}.${rawToken}`,
    service: new SessionService(repository as unknown as SessionRepository),
    user,
  }
}

describe('verifying a session cookie', () => {
  it('accepts a valid cookie for an active user', async () => {
    expect.hasAssertions()

    const { cookieValue, service } = setup('active')
    const result = await service.verifyCookieSession(cookieValue)

    expect(result).toMatchObject({ ok: true, value: { serializedCookie: null, user: { id: 1 } } })
  })

  it.each(['guest', 'suspended', 'deleted'] as const)(
    'rejects a valid cookie and clears it when the user is %s',
    async (status) => {
      expect.hasAssertions()

      const { cookieValue, service } = setup(status)
      const result = await service.verifyCookieSession(cookieValue)

      expect(result).toStrictEqual({
        error: { serializedCookie: clearSessionCookie(), type: 'SessionUserInactiveError' },
        ok: false,
      })
    },
  )

  it('does not revive a rejected session when the user is reactivated', async () => {
    expect.hasAssertions()

    const { cookieValue, service, user } = setup('suspended')
    await service.verifyCookieSession(cookieValue)
    user.status = 'active'
    const result = await service.verifyCookieSession(cookieValue)

    expect(result).toStrictEqual({
      error: { serializedCookie: clearSessionCookie(), type: 'SessionNotFoundError' },
      ok: false,
    })
  })
})
