import { describe, expect, it } from 'vitest'

import { createDriverDb } from '#/server/testing/driver-db'
import { okValue } from '#/server/testing/result'

import { findSessionByIdWithUser } from './sessions.repository.server'

const SESSION_ID = 'session'.padEnd(21, '0')

const USER_COLUMNS = [
  7,
  'member@give.test',
  '2025-01-01 00:05:00+00',
  'Mem',
  'Ber',
  'user',
  'active',
  'start_fresh',
  '2025-01-01 00:00:00+00',
  '2025-01-01 00:05:00+00',
]

const rowWithSettings = (settings: [boolean | null, number | null]) => [
  '2026-02-01 00:00:00+00',
  SESSION_ID,
  'hash',
  ...USER_COLUMNS,
  ...settings,
]

async function lookedUp(row: unknown[]) {
  const statements: { params: unknown[]; sql: string }[] = []
  const db = createDriverDb((sql, params) => {
    statements.push({ params, sql })
    return Promise.resolve({ rowCount: 1, rows: [row] })
  })
  const found = okValue(await db.run(findSessionByIdWithUser(SESSION_ID)))
  return { found, statements }
}

describe('the session lookup', () => {
  it('reads the session, its user and their settings in one statement', async () => {
    expect.hasAssertions()

    const { found, statements } = await lookedUp(rowWithSettings([true, 7]))

    expect(statements).toHaveLength(1)
    expect(statements[0]?.params).toStrictEqual([SESSION_ID])
    expect(statements[0]?.sql).toBe(
      'select "sessions"."expires_at", "sessions"."id", "sessions"."token_hash", ' +
        '"users"."id", "users"."email", "users"."email_verified_at", "users"."first_name", ' +
        '"users"."last_name", "users"."role", "users"."status", "users"."journey", ' +
        '"users"."created_at", "users"."updated_at", ' +
        '"user_settings"."privacy_mode", "user_settings"."user_id" ' +
        'from "sessions" inner join "users" on "sessions"."user_id" = "users"."id" ' +
        'left join "user_settings" on "user_settings"."user_id" = "users"."id" ' +
        'where "sessions"."id" = $1',
    )
    expect(found).toStrictEqual({
      session: { expiresAt: new Date('2026-02-01T00:00:00Z'), id: SESSION_ID, tokenHash: 'hash' },
      user: {
        createdAt: new Date('2025-01-01T00:00:00Z'),
        email: 'member@give.test',
        emailVerifiedAt: new Date('2025-01-01T00:05:00Z'),
        firstName: 'Mem',
        id: 7,
        journey: 'start_fresh',
        lastName: 'Ber',
        role: 'user',
        status: 'active',
        updatedAt: new Date('2025-01-01T00:05:00Z'),
      },
      userSettings: { privacyMode: true, userId: 7 },
    })
  })

  it('gives a user who never saved settings privacy mode off', async () => {
    expect.hasAssertions()

    const { found } = await lookedUp(rowWithSettings([null, null]))

    expect(found?.userSettings).toStrictEqual({ privacyMode: false, userId: 7 })
  })
})
