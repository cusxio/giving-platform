import { describe, expect, it, onTestFinished, vi } from 'vitest'

import { TZDate } from '#/core/date'
import { createDriverDb } from '#/server/testing/driver-db'
import { recordingLogger } from '#/server/testing/recording-logger'
import { testDeps } from '#/server/testing/test-deps'

import { handleCleanup } from './cleanup.server'

const NOW = new Date('2026-11-05T19:00:00Z')
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000)
/** `now()` answers a TZDate, and drizzle sends its ISO string. */
const param = (date: Date) => new TZDate(date, 'UTC').toISOString()

const DEAD_TOKENS =
  'delete from "tokens" where ("tokens"."used_at" is not null or "tokens"."expires_at" <= $1) ' +
  'returning "id"'
const STALE_ATTEMPTS =
  'delete from "rate_limit_attempts" where "rate_limit_attempts"."window_started_at" <= $1 ' +
  'returning "id"'

interface Statement {
  params: unknown[]
  sql: string
}

/** Answers each delete with `deleted[table]` rows, or fails the one named by `failing`. */
function tableDb(deleted: Record<string, number>, failing?: string) {
  const statements: Statement[] = []
  const db = createDriverDb((sql, params) => {
    statements.push({ params, sql })
    const table = /^delete from "(?<table>\w+)"/u.exec(sql)?.groups?.table ?? ''
    if (table === failing) {
      return Promise.reject(new Error(`${table} unavailable`))
    }
    const rows = Array.from({ length: deleted[table] ?? 0 }, (_row, index) => [index + 1])
    return Promise.resolve({ rowCount: rows.length, rows })
  })
  return { db, statements }
}

async function run(db: ReturnType<typeof tableDb>['db'], authorization?: string) {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  onTestFinished(() => {
    vi.useRealTimers()
  })
  const { events, logger } = recordingLogger()
  const base = testDeps()
  const headers = new Headers(authorization === undefined ? {} : { authorization })
  const response = await handleCleanup(
    { config: { ...base.config, cronSecret: 'cron-secret' }, db, logger },
    new Request('https://app.give.test/api/auth/cron', { headers }),
  )
  return { body: await response.text(), events, status: response.status }
}

describe('the auth cleanup cron', () => {
  it('deletes claimed and expired codes, and rate-limit rows past the longest window', async () => {
    expect.hasAssertions()

    const { db, statements } = tableDb({ rate_limit_attempts: 2, tokens: 3 })
    const { body, events, status } = await run(db, 'Bearer cron-secret')

    expect({ body, status }).toStrictEqual({ body: 'ok', status: 200 })
    expect(statements).toStrictEqual([
      { params: [param(NOW)], sql: DEAD_TOKENS },
      { params: [param(minutesAgo(15))], sql: STALE_ATTEMPTS },
    ])
    expect(events).toStrictEqual([
      expect.objectContaining({
        event: 'auth.cron.complete',
        level: 30,
        stats: { dead_tokens: 3, stale_attempts: 2 },
      }),
    ])
  })

  it.each([
    ['no authorization header', undefined],
    ['the wrong secret', 'Bearer not-the-secret'],
  ])('refuses a call with %s before touching the database', async (_case, authorization) => {
    expect.hasAssertions()

    const { db, statements } = tableDb({})
    const { body, events, status } = await run(db, authorization)

    expect({ body, status }).toStrictEqual({ body: 'Unauthorized', status: 401 })
    expect(statements).toStrictEqual([])
    expect(events).toStrictEqual([
      expect.objectContaining({ event: 'auth.cron.unauthorized', level: 40 }),
    ])
  })

  it('still deletes the stale rate-limit rows when the token delete fails, and answers 500', async () => {
    expect.hasAssertions()

    const { db, statements } = tableDb({ rate_limit_attempts: 2 }, 'tokens')
    const { body, events, status } = await run(db, 'Bearer cron-secret')

    expect({ body, status }).toStrictEqual({ body: 'Internal Server Error', status: 500 })
    expect(statements.map((s) => s.sql)).toStrictEqual([DEAD_TOKENS, STALE_ATTEMPTS])
    expect(events).toStrictEqual([
      expect.objectContaining({
        'error.type': 'Error',
        event: 'auth.cron.failed',
        level: 50,
        op: 'auth.deleteDeadTokens',
      }),
    ])
  })
})
