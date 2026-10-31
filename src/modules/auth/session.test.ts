import { pino } from 'pino'
import { describe, expect, it, vi } from 'vitest'

import { addDays, now } from '#/core/date'
import { createFakeDb } from '#/server/testing/fake-db'
import { testDeps } from '#/server/testing/test-deps'

import { endSession, logoutProcedure } from './session.server'
import { deleteSessionById } from './sessions.repository.server'

const io = vi.hoisted(() => ({ setCookies: [] as string[] }))

vi.mock(import('@tanstack/react-start/server'), () => ({
  setResponseHeader: (name, value) => {
    if (name === 'Set-Cookie') {
      io.setCookies.push(...[value].flat())
    }
  },
}))

const SESSION_ID = 'session'.padEnd(21, '0')
const CLEARED =
  '__session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax'

interface LogLine {
  readonly event?: string
  readonly level: number
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
    const db = createFakeDb().on(deleteSessionById, () => {
      throw new Error('connection terminated')
    })
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

    const db = createFakeDb().on(deleteSessionById, () => {
      throw new Error('connection terminated')
    })
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
