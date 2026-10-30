import { describe, expect, it, vi } from 'vitest'

import { ok } from '#/core/result'
import type { DB } from '#/server/neon.server'
import type { Token, User } from '#/server/schema.server'

import type { SessionRepository } from '../session/session.repository'
import type { UserRepository } from '../user/user.repository'

import { AuthService } from './auth.service'
import type { TokenRepository } from './token.repository'

vi.mock(import('#/server/env.server'), () => ({ SESSION_SECRET: 'test-session-secret' }))

const EMAIL = 'donor@example.com'

type FakeUser = Pick<User, 'email' | 'id' | 'status'>
type FakeToken = Pick<Token, 'id' | 'mode' | 'tokenHash' | 'usedAt'>

interface Query {
  run: () => unknown
}

function setup(existing?: User['status']) {
  const users = new Map<User['email'], FakeUser>()
  if (existing) {
    users.set(EMAIL, { email: EMAIL, id: 1, status: existing })
  }
  const tokens: (FakeToken & { userId: User['id'] })[] = []
  const sentEmails: { text: string; to: string }[] = []

  const userRepository = {
    createUser: ({ email }: Pick<User, 'email'>) => {
      const user: FakeUser = { email, id: users.size + 1, status: 'guest' }
      users.set(email, user)
      return Promise.resolve(ok({ ...user }))
    },
    findUserByEmail: (email: User['email']) => {
      const user = users.get(email)
      return Promise.resolve(ok(user ? { ...user } : null))
    },
    markUserAsActiveByIdQuery: (id: User['id']): Query => ({
      run: () => {
        for (const user of users.values()) {
          if (user.id === id) {
            user.status = 'active'
          }
        }
        return []
      },
    }),
  }

  const tokenRepository = {
    claimTokenIfUnused: (id: Token['id']) => {
      const token = tokens.find((t) => t.id === id && t.usedAt === null)
      if (token) {
        token.usedAt = new Date()
      }
      return Promise.resolve(ok(token !== undefined))
    },
    createToken: (userId: User['id'], tokenHash: Token['tokenHash'], mode: Token['mode']) => {
      tokens.unshift({ id: tokens.length + 1, mode, tokenHash, usedAt: null, userId })
      return Promise.resolve(ok())
    },
    findToken: (userId: User['id']) => {
      const token = tokens.find((t) => t.userId === userId && t.usedAt === null)
      return Promise.resolve(ok(token ?? null))
    },
  }

  const sessionRepository = {
    createSessionQuery: ({ userId }: { userId: User['id'] }): Query => ({
      run: () => [{ id: `session-${userId}` }],
    }),
  }

  const db = { batch: (queries: Query[]) => Promise.resolve(queries.map((q) => q.run())) }

  const emailService = {
    sendEmail: ({ text, to }: { text: string; to: string }) => {
      sentEmails.push({ text, to })
      return Promise.resolve(ok())
    },
  }

  const service = new AuthService(
    db as unknown as DB,
    {
      sessionRepository: sessionRepository as unknown as SessionRepository,
      tokenRepository: tokenRepository as unknown as TokenRepository,
      userRepository: userRepository as unknown as UserRepository,
    },
    { emailService },
  )

  return {
    lastOtp: () => /\b\d{6}\b/u.exec(sentEmails.at(-1)?.text ?? '')?.[0] ?? '',
    sentEmails,
    service,
    setStatus: (email: User['email'], status: User['status']) => {
      const user = users.get(email)
      if (user) {
        user.status = status
      }
    },
    statusOf: (email: User['email']) => users.get(email)?.status,
  }
}

describe('signing up', () => {
  it('emails a code to a new email address', async () => {
    expect.hasAssertions()

    const { sentEmails, service, statusOf } = setup()
    const result = await service.signup(EMAIL)

    expect(result).toStrictEqual({ ok: true, value: undefined })
    expect(sentEmails.map((e) => e.to)).toStrictEqual([EMAIL])
    expect(statusOf(EMAIL)).toBe('guest')
  })

  it('emails a code to a guest', async () => {
    expect.hasAssertions()

    const { sentEmails, service } = setup('guest')
    const result = await service.signup(EMAIL)

    expect(result).toStrictEqual({ ok: true, value: undefined })
    expect(sentEmails.map((e) => e.to)).toStrictEqual([EMAIL])
  })

  it('rejects an active user without emailing a code', async () => {
    expect.hasAssertions()

    const { sentEmails, service } = setup('active')
    const result = await service.signup(EMAIL)

    expect(result).toStrictEqual({ error: { type: 'AlreadyExistsError' }, ok: false })
    expect(sentEmails).toStrictEqual([])
  })

  it.each(['suspended', 'deleted'] as const)(
    'rejects a %s user without emailing a code',
    async (status) => {
      expect.hasAssertions()

      const { sentEmails, service, statusOf } = setup(status)
      const result = await service.signup(EMAIL)

      expect(result).toMatchObject({ error: { type: 'InactiveAccountError' }, ok: false })
      expect(sentEmails).toStrictEqual([])
      expect(statusOf(EMAIL)).toBe(status)
    },
  )
})

describe('validating a signup code', () => {
  it('activates a guest and issues a session', async () => {
    expect.hasAssertions()

    const { lastOtp, service, statusOf } = setup('guest')
    await service.signup(EMAIL)
    const result = await service.validateOtp(EMAIL, lastOtp(), 'signup')

    expect(result).toMatchObject({ ok: true })
    expect(statusOf(EMAIL)).toBe('active')
  })

  it.each(['suspended', 'deleted'] as const)(
    'rejects a code issued before the user was %s without activating them',
    async (status) => {
      expect.hasAssertions()

      const { lastOtp, service, setStatus, statusOf } = setup('guest')
      await service.signup(EMAIL)
      const otp = lastOtp()
      setStatus(EMAIL, status)
      const result = await service.validateOtp(EMAIL, otp, 'signup')

      expect(result).toStrictEqual({ error: { type: 'InvalidRequestError' }, ok: false })
      expect(statusOf(EMAIL)).toBe(status)
    },
  )
})
