import { pino } from 'pino'
import { describe, expect, it, vi } from 'vitest'

import { addDays, now } from '#/core/date'
import type { QueryResult } from '#/server/db.server'
import { createFakeDb } from '#/server/testing/fake-db'
import { testDeps } from '#/server/testing/test-deps'

import { clearSessionCookie } from './session-cookie.server'
import { endSession, logoutProcedure, resolveSession, verifySessionCookie } from './session.server'
import {
  deleteSessionById,
  extendSession,
  findSessionByIdWithUser,
} from './sessions.repository.server'

const io = vi.hoisted(() => ({ setCookies: [] as string[] }))

vi.mock(import('@tanstack/react-start/server'), () => ({
  setResponseHeader: (name, value) => {
    if (name === 'Set-Cookie') {
      io.setCookies.push(...[value].flat())
    }
  },
}))

const SESSION_ID = 'session'.padEnd(21, '0')
const RAW_TOKEN = 'token'.padEnd(21, '0')
const CLEARED =
  '__session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax'

interface LogLine {
  readonly event?: string
  readonly level: number
  readonly reason?: string
}

function recordingLogger() {
  const events: LogLine[] = []
  const logger = pino(
    { level: 'debug' },
    {
      write: (line: string) => {
        events.push(JSON.parse(line) as LogLine)
      },
    },
  )
  return { events, logger }
}

function fail(): never {
  throw new Error('connection terminated')
}

type SessionWithUser = NonNullable<QueryResult<typeof findSessionByIdWithUser>>
type FakeUser = SessionWithUser['user']

function setup(status: FakeUser['status'], expiresInDays = 30) {
  const user: FakeUser = { id: 1, journey: 'start_fresh', role: 'user', status }
  const { events, logger } = recordingLogger()
  const { hashToken } = testDeps()
  const sessions = new Map<string, SessionWithUser['session']>([
    [
      SESSION_ID,
      { expiresAt: addDays(now(), expiresInDays), id: SESSION_ID, tokenHash: hashToken(RAW_TOKEN) },
    ],
  ])

  const db = createFakeDb()
    .on(deleteSessionById, (id) => {
      sessions.delete(id)
    })
    .on(extendSession, (id, expiresAt) => {
      const session = sessions.get(id)
      if (!session) {
        return null
      }
      session.expiresAt = expiresAt
      return { ...session, createdAt: now(), updatedAt: now(), userId: user.id }
    })
    .on(findSessionByIdWithUser, (id) => {
      const session = sessions.get(id)
      return session ? { session: { ...session }, user: { ...user } } : null
    })

  io.setCookies = []

  return {
    cookieValue: `${SESSION_ID}.${RAW_TOKEN}`,
    db,
    deps: testDeps({ db, logger }),
    events,
    sessions,
    user,
  }
}

const backgroundWork = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

describe('verifying a session cookie', () => {
  it('accepts a valid cookie for an active user', async () => {
    expect.hasAssertions()

    const { cookieValue, deps } = setup('active')
    const result = await resolveSession(deps, cookieValue)

    expect(result).toMatchObject({ ok: true, value: { serializedCookie: null, user: { id: 1 } } })
  })

  it.each(['guest', 'suspended', 'deleted'] as const)(
    'rejects a valid cookie and clears it when the user is %s',
    async (status) => {
      expect.hasAssertions()

      const { cookieValue, deps } = setup(status)
      const result = await resolveSession(deps, cookieValue)

      expect(result).toStrictEqual({
        error: { serializedCookie: clearSessionCookie(), type: 'SessionUserInactiveError' },
        ok: false,
      })
    },
  )

  it('does not revive a rejected session when the user is reactivated', async () => {
    expect.hasAssertions()

    const { cookieValue, deps, user } = setup('suspended')
    await resolveSession(deps, cookieValue)
    user.status = 'active'
    const result = await resolveSession(deps, cookieValue)

    expect(result).toStrictEqual({
      error: { serializedCookie: clearSessionCookie(), type: 'SessionNotFoundError' },
      ok: false,
    })
  })
})

describe('the session cookie on the response', () => {
  it('passes a valid session through without touching the cookie', async () => {
    expect.hasAssertions()

    const { cookieValue, deps, events } = setup('active', 20)
    const check = await verifySessionCookie(deps, cookieValue)

    expect(check.user).toMatchObject({ id: 1, journey: 'start_fresh', role: 'user' })
    expect(check.session).toMatchObject({ id: SESSION_ID, tokenHash: deps.hashToken(RAW_TOKEN) })
    expect(io.setCookies).toStrictEqual([])
    expect(events).toStrictEqual([])
  })

  it('extends a session within a week of expiry and sends the refreshed cookie', async () => {
    expect.hasAssertions()

    const { cookieValue, deps, events, sessions } = setup('active', 3)
    const check = await verifySessionCookie(deps, cookieValue)
    await backgroundWork()

    expect(io.setCookies).toHaveLength(1)
    expect(io.setCookies[0]).toMatch(new RegExp(`^__session=${cookieValue};`, 'u'))
    expect(check.session?.expiresAt.getTime()).toBeGreaterThan(addDays(now(), 29).getTime())
    expect(sessions.get(SESSION_ID)?.expiresAt).toStrictEqual(check.session?.expiresAt)
    expect(events.map((e) => e.event)).toStrictEqual(['session.extend.background_success'])
  })

  it('still sends the refreshed cookie when the background extension fails', async () => {
    expect.hasAssertions()

    const { cookieValue, db, deps, events } = setup('active', 3)
    db.on(extendSession, fail)
    await verifySessionCookie(deps, cookieValue)
    await backgroundWork()

    expect(io.setCookies[0]).toMatch(new RegExp(`^__session=${cookieValue};`, 'u'))
    expect(events).toMatchObject([{ event: 'session.extend.background_failed', level: 40 }])
  })

  it('rejects the session of a suspended user, deletes it and clears the cookie', async () => {
    expect.hasAssertions()

    const { cookieValue, deps, events, sessions } = setup('suspended', 20)
    const check = await verifySessionCookie(deps, cookieValue)

    expect(check).toStrictEqual({ session: null, user: null })
    expect(sessions.has(SESSION_ID)).toBe(false)
    expect(io.setCookies).toStrictEqual([CLEARED])
    expect(events).toMatchObject([
      { event: 'session.verify.invalid', level: 30, reason: 'SessionUserInactiveError' },
    ])
  })

  it('still clears the cookie of a suspended user whose session cannot be deleted', async () => {
    expect.hasAssertions()

    const { cookieValue, db, deps, events } = setup('suspended', 20)
    db.on(deleteSessionById, fail)

    await expect(verifySessionCookie(deps, cookieValue)).resolves.toStrictEqual({
      session: null,
      user: null,
    })
    expect(io.setCookies).toStrictEqual([CLEARED])
    expect(events.map((e) => [e.event, e.level])).toStrictEqual([
      ['session.verify.inactive_delete_failed', 40],
      ['session.verify.invalid', 30],
    ])
  })

  it.each([
    ['expired', 'SessionExpiredError', 0, `${SESSION_ID}.${RAW_TOKEN}`],
    ['for an unknown session', 'SessionNotFoundError', 30, `${'x'.repeat(21)}.${RAW_TOKEN}`],
    ['signed with another token', 'SessionInvalidError', 30, `${SESSION_ID}.${'y'.repeat(21)}`],
  ] as const)('clears a cookie that is %s', async (_label, reason, days, cookie) => {
    expect.hasAssertions()

    const { deps, events } = setup('active', days)

    await expect(verifySessionCookie(deps, cookie)).resolves.toStrictEqual({
      session: null,
      user: null,
    })
    expect(io.setCookies).toStrictEqual([CLEARED])
    expect(events).toMatchObject([{ event: 'session.verify.invalid', level: 30, reason }])
  })

  it.each([
    ['malformed', 'not-a-session', 'session.verify.validation_failed', 40],
    ['unreadable from the db', `${SESSION_ID}.${RAW_TOKEN}`, 'session.verify.db_error', 50],
  ] as const)('clears a cookie that is %s', async (_label, cookie, event, level) => {
    expect.hasAssertions()

    const { db, deps, events } = setup('active', 20)
    db.on(findSessionByIdWithUser, fail)

    await expect(verifySessionCookie(deps, cookie)).resolves.toStrictEqual({
      session: null,
      user: null,
    })
    expect(io.setCookies).toStrictEqual([CLEARED])
    expect(events).toMatchObject([{ event, level }])
  })
})

describe('logging out', () => {
  it('deletes the session, clears the cookie and redirects to login', async () => {
    expect.hasAssertions()

    io.setCookies = []
    const db = createFakeDb().on(deleteSessionById, () => {})
    const { events, logger } = recordingLogger()
    const session = { expiresAt: addDays(now(), 20), id: SESSION_ID, tokenHash: 'hash' }

    await expect(
      logoutProcedure({ deps: testDeps({ db, logger }), session }),
    ).rejects.toMatchObject({ options: { replace: true, to: '/auth/login' } })
    expect(db.calls).toStrictEqual([{ args: [SESSION_ID], name: 'auth.deleteSessionById' }])
    expect(events.map((e) => e.event)).toStrictEqual(['auth.logout.processing'])
    expect(io.setCookies).toStrictEqual([CLEARED])
  })

  it('still clears the cookie when the session row cannot be deleted', async () => {
    expect.hasAssertions()

    io.setCookies = []
    const db = createFakeDb().on(deleteSessionById, fail)
    const { events, logger } = recordingLogger()
    const session = { expiresAt: addDays(now(), 20), id: SESSION_ID, tokenHash: 'hash' }

    await expect(
      logoutProcedure({ deps: testDeps({ db, logger }), session }),
    ).rejects.toMatchObject({ options: { replace: true, to: '/auth/login' } })
    expect(events.at(-1)).toMatchObject({ event: 'auth.logout.failed', level: 50 })
    expect(io.setCookies).toStrictEqual([CLEARED])
  })

  it('swallows a failed delete after logging it', async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(deleteSessionById, fail)
    const { events, logger } = recordingLogger()

    await expect(endSession(testDeps({ db, logger }), SESSION_ID)).resolves.toBeUndefined()
    expect(events.map((e) => [e.event, e.level])).toStrictEqual([
      ['auth.logout.processing', 30],
      ['auth.logout.failed', 50],
    ])
  })

  it('clears the cookie of a caller without a session without touching the database', async () => {
    expect.hasAssertions()

    io.setCookies = []
    const db = createFakeDb()
    const { events, logger } = recordingLogger()

    await expect(
      logoutProcedure({ deps: testDeps({ db, logger }), session: null }),
    ).rejects.toMatchObject({ options: { replace: true, to: '/auth/login' } })
    expect(db.calls).toStrictEqual([])
    expect(events).toStrictEqual([])
    expect(io.setCookies).toStrictEqual([CLEARED])
  })
})
