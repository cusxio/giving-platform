import { describe, expect, it, onTestFinished, vi } from 'vitest'

import { TZDate } from '#/core/date'
import type { Query } from '#/server/db.server'
import { createDriverDb } from '#/server/testing/driver-db'

import { createToken, deleteDeadTokensOf } from './tokens.repository.server'

const NOW = new Date('2026-11-05T10:00:00Z')
const minutesFromNow = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000)
/** `now()` answers a TZDate, and drizzle sends its ISO string. */
const param = (date: Date) => new TZDate(date, 'UTC').toISOString()

async function sent(query: Query<unknown>) {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  onTestFinished(() => {
    vi.useRealTimers()
  })
  const statements: { params: unknown[]; sql: string }[] = []
  const db = createDriverDb((sql, params) => {
    statements.push({ params, sql })
    return Promise.resolve({ rowCount: 0, rows: [] })
  })
  await db.run(query)
  return statements
}

describe('storing a code', () => {
  it('refreshes the live row that already holds its hash, with the new expiry and mode', async () => {
    expect.hasAssertions()

    const statements = await sent(createToken(7, 'hash-of-123456', 'login'))

    expect(statements).toStrictEqual([
      {
        params: [param(minutesFromNow(5)), 'login', 'hash-of-123456', 7],
        sql:
          'insert into "tokens" ("created_at", "expires_at", "id", "mode", "token_hash", "used_at", "user_id") ' +
          'values (default, $1, default, $2, $3, default, $4) ' +
          'on conflict ("token_hash","user_id") do update set "expires_at" = excluded.expires_at, "mode" = excluded.mode',
      },
    ])
  })

  it("deletes only the user's claimed and expired codes when issuing one", async () => {
    expect.hasAssertions()

    const statements = await sent(deleteDeadTokensOf(7))

    expect(statements).toStrictEqual([
      {
        params: [7, param(NOW)],
        sql:
          'delete from "tokens" where ("tokens"."user_id" = $1 and ' +
          '("tokens"."used_at" is not null or "tokens"."expires_at" <= $2))',
      },
    ])
  })
})
