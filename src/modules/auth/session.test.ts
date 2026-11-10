import { SpanStatusCode } from '@opentelemetry/api'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'

import { addDays, now } from '#/core/date'
import type { Db, QueryResult } from '#/server/db.server'
import { createFakeDb } from '#/server/testing/fake-db'
import { recordingLogger } from '#/server/testing/recording-logger'
import { inRequestSpan } from '#/server/testing/spans'
import { testDeps } from '#/server/testing/test-deps'

import type { hasSession, logout } from './auth.functions'
import { endSession, hasSessionAction, logoutAction, verifySessionCookie } from './session.server'
import {
  deleteSessionById,
  extendSession,
  findSessionByIdWithUser,
} from './sessions.repository.server'

const io = vi.hoisted(() => ({
  request: new Request('https://app.give.test/'),
  setCookies: [] as string[],
}))

vi.mock(import('@tanstack/react-start/server'), () => ({
  getRequest: () => io.request,
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

function fail(): never {
  throw new Error('connection terminated')
}

type SessionWithUser = NonNullable<QueryResult<typeof findSessionByIdWithUser>>
type FakeUser = SessionWithUser['user']

const ANONYMOUS = { session: null, user: null, userSettings: null }

function setup(status: FakeUser['status'], expiresInDays = 30) {
  const user: FakeUser = {
    createdAt: new Date('2025-01-01T00:00:00Z'),
    email: 'member@give.test',
    emailVerifiedAt: new Date('2025-01-01T00:05:00Z'),
    firstName: 'Mem',
    id: 1,
    journey: 'start_fresh',
    lastName: 'Ber',
    role: 'user',
    status,
    updatedAt: new Date('2025-01-01T00:05:00Z'),
  }
  const userSettings = { privacyMode: true, userId: 1 }
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
      return session
        ? { session: { ...session }, user: { ...user }, userSettings: { ...userSettings } }
        : null
    })

  io.request = new Request('https://app.give.test/')
  io.setCookies = []

  return {
    cookieValue: `${SESSION_ID}.${RAW_TOKEN}`,
    db,
    deps: testDeps({ db, logger }),
    events,
    sessions,
    user,
    userSettings,
  }
}

const nextTask = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

/** A database whose session extension waits for `release`, like a slow write. */
function slowExtension(db: Db) {
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const slow: Db = {
    ...db,
    run: (query) =>
      query.name === extendSession.queryName ? held.then(() => db.run(query)) : db.run(query),
  }
  return { db: slow, release }
}

/** A database whose session extension rejects instead of answering a Result, like a bug. */
const crashingExtension = (db: Db): Db => ({
  ...db,
  run: (query) =>
    query.name === extendSession.queryName
      ? Promise.reject(new Error('driver crashed'))
      : db.run(query),
})

describe('verifying a session cookie', () => {
  it('accepts a valid cookie for an active user, with their row and settings', async () => {
    expect.hasAssertions()

    const { cookieValue, db, deps, sessions, user, userSettings } = setup('active')

    await expect(verifySessionCookie(deps, cookieValue)).resolves.toStrictEqual({
      session: sessions.get(SESSION_ID),
      user,
      userSettings,
    })
    expect(db.roundTrips).toStrictEqual([[findSessionByIdWithUser.queryName]])
  })

  it.each(['guest', 'suspended', 'deleted'] as const)(
    'rejects a valid cookie and clears it when the user is %s',
    async (status) => {
      expect.hasAssertions()

      const { cookieValue, deps, events } = setup(status)

      await expect(verifySessionCookie(deps, cookieValue)).resolves.toStrictEqual(ANONYMOUS)
      expect(io.setCookies).toStrictEqual([CLEARED])
      expect(events).toMatchObject([{ reason: 'SessionUserInactiveError' }])
    },
  )

  it('does not revive a rejected session when the user is reactivated', async () => {
    expect.hasAssertions()

    const { cookieValue, deps, events, user } = setup('suspended')
    await verifySessionCookie(deps, cookieValue)
    user.status = 'active'

    await expect(verifySessionCookie(deps, cookieValue)).resolves.toStrictEqual(ANONYMOUS)
    expect(events.at(-1)).toMatchObject({ reason: 'SessionNotFoundError' })
  })
})

describe('the session cookie on the response', () => {
  it('passes a valid session through without touching the cookie', async () => {
    expect.hasAssertions()

    const { cookieValue, deps, events, user, userSettings } = setup('active', 20)
    const check = await verifySessionCookie(deps, cookieValue)

    expect(check.user).toStrictEqual(user)
    expect(check.userSettings).toStrictEqual(userSettings)
    expect(check.session).toMatchObject({ id: SESSION_ID, tokenHash: deps.hashToken(RAW_TOKEN) })
    expect(io.setCookies).toStrictEqual([])
    expect(events).toStrictEqual([])
  })

  it('extends a session within a week of expiry and sends the refreshed cookie', async () => {
    expect.hasAssertions()

    const { cookieValue, deps, events, sessions, user, userSettings } = setup('active', 3)
    const check = await verifySessionCookie(deps, cookieValue)

    expect(io.setCookies).toStrictEqual([
      expect.stringMatching(new RegExp(`^__session=${cookieValue};`, 'u')),
    ])
    expect(check).toMatchObject({ user, userSettings })
    expect(check.session?.expiresAt.getTime()).toBeGreaterThan(addDays(now(), 29).getTime())
    expect(sessions.get(SESSION_ID)?.expiresAt).toStrictEqual(check.session?.expiresAt)
    expect(events.map((e) => e.event)).toStrictEqual(['session.extend.background_success'])
  })

  it('still sends the refreshed cookie when the background extension fails', async () => {
    expect.hasAssertions()

    const { cookieValue, db, deps, events } = setup('active', 3)
    db.on(extendSession, fail)
    await verifySessionCookie(deps, cookieValue)

    expect(io.setCookies[0]).toMatch(new RegExp(`^__session=${cookieValue};`, 'u'))
    expect(events).toMatchObject([
      { event: 'session.extend.background_failed', level: 40, op: 'auth.extendSession' },
    ])
  })

  it('hands the extension to the platform, so the response does not wait for the write', async () => {
    expect.hasAssertions()

    const { cookieValue, deps, events, sessions } = setup('active', 3)
    const before = sessions.get(SESSION_ID)?.expiresAt
    const { db, release } = slowExtension(deps.db)
    const kept: Promise<unknown>[] = []
    io.request = Object.assign(new Request('https://app.give.test/'), {
      waitUntil: (work: Promise<unknown>) => {
        kept.push(work)
      },
    })
    const check = await verifySessionCookie({ ...deps, db }, cookieValue)

    expect(io.setCookies[0]).toMatch(new RegExp(`^__session=${cookieValue};`, 'u'))
    expect(kept).toHaveLength(1)
    expect(sessions.get(SESSION_ID)?.expiresAt).toStrictEqual(before)

    release()
    await Promise.all(kept)

    expect(sessions.get(SESSION_ID)?.expiresAt).toStrictEqual(check.session?.expiresAt)
    expect(events.map((e) => e.event)).toStrictEqual(['session.extend.background_success'])
  })

  it('logs a crash of the handed-over extension, so the platform never sees a rejection', async () => {
    expect.hasAssertions()

    const { cookieValue, deps, events } = setup('active', 3)
    const kept: Promise<unknown>[] = []
    io.request = Object.assign(new Request('https://app.give.test/'), {
      waitUntil: (work: Promise<unknown>) => {
        kept.push(work)
      },
    })

    const check = await verifySessionCookie(
      { ...deps, db: crashingExtension(deps.db) },
      cookieValue,
    )

    expect(check.user).toMatchObject({ id: 1 })
    expect(io.setCookies[0]).toMatch(new RegExp(`^__session=${cookieValue};`, 'u'))
    await expect(Promise.all(kept)).resolves.toStrictEqual([undefined])
    expect(events).toMatchObject([
      {
        err: { message: 'driver crashed' },
        event: 'session.extend.background_crash',
        level: 50,
        session_id: SESSION_ID,
      },
    ])
  })

  it('waits for the extension where the platform has no waitUntil', async () => {
    expect.hasAssertions()

    const { cookieValue, deps, sessions } = setup('active', 3)
    const { db, release } = slowExtension(deps.db)
    let answered = false
    const pending = verifySessionCookie({ ...deps, db }, cookieValue).finally(() => {
      answered = true
    })
    await nextTask()

    expect(answered).toBe(false)

    release()
    const check = await pending

    expect(sessions.get(SESSION_ID)?.expiresAt).toStrictEqual(check.session?.expiresAt)
  })

  it('rejects the session of a suspended user, deletes it and clears the cookie', async () => {
    expect.hasAssertions()

    const { cookieValue, deps, events, sessions } = setup('suspended', 20)
    const check = await verifySessionCookie(deps, cookieValue)

    expect(check).toStrictEqual(ANONYMOUS)
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

    await expect(verifySessionCookie(deps, cookieValue)).resolves.toStrictEqual(ANONYMOUS)
    expect(io.setCookies).toStrictEqual([CLEARED])
    expect(events).toMatchObject([
      { event: 'session.verify.inactive_delete_failed', level: 40, op: 'auth.deleteSessionById' },
      { event: 'session.verify.invalid', level: 30 },
    ])
  })

  it.each([
    ['expired', 'SessionExpiredError', 0, `${SESSION_ID}.${RAW_TOKEN}`],
    ['for an unknown session', 'SessionNotFoundError', 30, `${'x'.repeat(21)}.${RAW_TOKEN}`],
    ['signed with another token', 'SessionInvalidError', 30, `${SESSION_ID}.${'y'.repeat(21)}`],
  ] as const)('clears a cookie that is %s', async (_label, reason, days, cookie) => {
    expect.hasAssertions()

    const { deps, events } = setup('active', days)

    await expect(verifySessionCookie(deps, cookie)).resolves.toStrictEqual(ANONYMOUS)
    expect(io.setCookies).toStrictEqual([CLEARED])
    expect(events).toMatchObject([{ event: 'session.verify.invalid', level: 30, reason }])
  })

  it.each([
    [
      'malformed',
      'not-a-session',
      { 'error.type': 'ParseError', event: 'session.verify.validation_failed', level: 40 },
    ],
    [
      'unreadable from the db',
      `${SESSION_ID}.${RAW_TOKEN}`,
      { event: 'session.verify.db_error', level: 50, op: 'auth.findSessionByIdWithUser' },
    ],
  ] as const)('clears a cookie that is %s', async (_label, cookie, logged) => {
    expect.hasAssertions()

    const { db, deps, events } = setup('active', 20)
    db.on(findSessionByIdWithUser, fail)

    await expect(verifySessionCookie(deps, cookie)).resolves.toStrictEqual(ANONYMOUS)
    expect(io.setCookies).toStrictEqual([CLEARED])
    expect(events).toMatchObject([logged])
  })
})

describe('the request span', () => {
  it('is marked failed when the session cannot be read', async () => {
    expect.hasAssertions()

    const { cookieValue, db, deps } = setup('active', 20)
    db.on(findSessionByIdWithUser, fail)
    const { span } = await inRequestSpan(() => verifySessionCookie(deps, cookieValue))

    expect(span.status.code).toBe(SpanStatusCode.ERROR)
  })

  it('stays as it is when only the session extension fails', async () => {
    expect.hasAssertions()

    const { cookieValue, db, deps } = setup('active', 3)
    db.on(extendSession, fail)
    const { span } = await inRequestSpan(() => verifySessionCookie(deps, cookieValue))

    expect(span.status.code).toBe(SpanStatusCode.UNSET)
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
      logoutAction({ context: { deps: testDeps({ db, logger }), session } }),
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
      logoutAction({ context: { deps: testDeps({ db, logger }), session } }),
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
    expect(events.at(-1)).toMatchObject({ 'error.type': 'Error', op: 'auth.deleteSessionById' })
  })

  it('clears the cookie of a caller without a session without touching the database', async () => {
    expect.hasAssertions()

    io.setCookies = []
    const db = createFakeDb()
    const { events, logger } = recordingLogger()

    await expect(
      logoutAction({ context: { deps: testDeps({ db, logger }), session: null } }),
    ).rejects.toMatchObject({ options: { replace: true, to: '/auth/login' } })
    expect(db.calls).toStrictEqual([])
    expect(events).toStrictEqual([])
    expect(io.setCookies).toStrictEqual([CLEARED])
  })
})

describe('the session check for the login pages', () => {
  it('answers only whether the request has a session', () => {
    expect.hasAssertions()

    expectTypeOf<Awaited<ReturnType<typeof hasSession>>>().toEqualTypeOf<boolean>()
    expectTypeOf<Awaited<ReturnType<typeof logout>>>().toEqualTypeOf<never>()

    const session = { expiresAt: addDays(now(), 20), id: SESSION_ID, tokenHash: 'hash' }

    expect(hasSessionAction({ context: { deps: testDeps(), session } })).toBe(true)
    expect(hasSessionAction({ context: { deps: testDeps(), session: null } })).toBe(false)
  })
})
