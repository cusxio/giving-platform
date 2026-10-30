import { pino } from 'pino'
import { describe, expect, it } from 'vitest'

import { hasGuestTransaction } from '#/modules/payments/server'
import { createFakeDb } from '#/server/testing/fake-db'
import { testDeps } from '#/server/testing/test-deps'

import {
  loadCurrentUser,
  loadWelcome,
  updatePrivacy,
  updatePrivacyModeProcedure,
  updateProfile,
  updateUserProcedure,
} from './account.server'
import { findSettingsByUserId, upsertPrivacyMode } from './user-settings.repository.server'
import { findUserById, updateUserById } from './users.repository.server'

function fail(): never {
  throw new Error('connection terminated')
}

const user = {
  createdAt: new Date('2025-01-01T00:00:00Z'),
  email: 'member@give.test',
  emailVerifiedAt: new Date('2025-01-01T00:05:00Z'),
  firstName: 'Mem',
  id: 2,
  journey: 'migrate' as const,
  lastName: 'Ber',
  role: 'user' as const,
  status: 'active' as const,
  updatedAt: new Date('2025-01-01T00:05:00Z'),
}

describe('the current user', () => {
  it('comes with their saved settings', async () => {
    expect.hasAssertions()

    const db = createFakeDb()
      .on(findUserById, () => user)
      .on(findSettingsByUserId, (userId) => ({ privacyMode: true, userId }))

    await expect(loadCurrentUser(testDeps({ db }), 2)).resolves.toStrictEqual({
      type: 'SUCCESS',
      value: { user, userSettings: { privacyMode: true, userId: 2 } },
    })
  })

  it('gets privacy mode off when they never saved settings', async () => {
    expect.hasAssertions()

    const db = createFakeDb()
      .on(findUserById, () => user)
      .on(findSettingsByUserId, () => null)

    await expect(loadCurrentUser(testDeps({ db }), 2)).resolves.toStrictEqual({
      type: 'SUCCESS',
      value: { user, userSettings: { privacyMode: false, userId: 2 } },
    })
  })

  it('is an auth error when the session outlived the account row', async () => {
    expect.hasAssertions()

    const db = createFakeDb()
      .on(findUserById, () => null)
      .on(findSettingsByUserId, () => null)

    await expect(loadCurrentUser(testDeps({ db }), 2)).resolves.toStrictEqual({
      type: 'AUTH_ERROR',
    })
  })
})

describe('the welcome data', () => {
  it.each([true, false])('reports guestTransactionExists=%s', async (exists) => {
    expect.hasAssertions()

    const db = createFakeDb()
      .on(findUserById, () => user)
      .on(hasGuestTransaction, () => exists)

    await expect(loadWelcome({ db }, 2)).resolves.toStrictEqual({
      guestTransactionExists: exists,
      user,
    })
  })

  it('is missing when the account row is gone', async () => {
    expect.hasAssertions()

    const db = createFakeDb()
      .on(findUserById, () => null)
      .on(hasGuestTransaction, () => true)

    await expect(loadWelcome({ db }, 2)).resolves.toBeNull()
  })
})

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

describe('updating the profile', () => {
  it('trims the names and saves the given fields', async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(updateUserById, (_id, changes) => ({ ...user, ...changes }))
    const { events, logger } = recordingLogger()

    await expect(
      updateProfile(testDeps({ db, logger }), 2, { firstName: '  Ada ', lastName: 'Lovelace  ' }),
    ).resolves.toStrictEqual({
      type: 'SUCCESS',
      value: { user: { ...user, firstName: 'Ada', lastName: 'Lovelace' } },
    })
    expect(db.calls).toStrictEqual([
      { args: [2, { firstName: 'Ada', lastName: 'Lovelace' }], name: 'account.updateUserById' },
    ])
    expect(events.map((e) => e.event)).toStrictEqual([
      'user.update_user.attempt',
      'user.update_user.success',
    ])
  })

  it('rejects a blank name without touching the database', async () => {
    expect.hasAssertions()

    const db = createFakeDb()
    const { events, logger } = recordingLogger()

    await expect(
      updateProfile(testDeps({ db, logger }), 2, { firstName: '   ', lastName: 'Lovelace' }),
    ).resolves.toStrictEqual({
      errors: [{ message: 'must not have fewer than 1 characters', path: '/firstName' }],
      type: 'VALIDATION_ERROR',
    })
    expect(db.calls).toStrictEqual([])
    expect(events.map((e) => e.event)).toStrictEqual(['user.update_user.validation_failed'])
  })

  it.each([
    { case: 'the statement fails', event: 'user.update_user.failed', impl: () => fail() },
    { case: 'no row comes back', event: 'user.update_user.empty_result', impl: () => null },
  ])('is a server error when $case', async ({ event, impl }) => {
    expect.hasAssertions()

    const db = createFakeDb().on(updateUserById, impl)
    const { events, logger } = recordingLogger()

    await expect(
      updateProfile(testDeps({ db, logger }), 2, { journey: 'start_fresh' }),
    ).resolves.toStrictEqual({ type: 'SERVER_ERROR' })
    expect(events.at(-1)).toMatchObject({ event, level: 50 })
  })

  it('redirects a signed-out caller to login', async () => {
    expect.hasAssertions()

    const db = createFakeDb()
    const { events, logger } = recordingLogger()

    await expect(
      updateUserProcedure({ deps: testDeps({ db, logger }), user: null }, { firstName: 'Ada' }),
    ).rejects.toMatchObject({ options: { to: '/auth/login' } })
    expect(db.calls).toStrictEqual([])
    expect(events.map((e) => e.event)).toStrictEqual(['user.update_user.unauthorized'])
  })
})

describe('updating privacy mode', () => {
  it('saves the setting and returns the row', async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(upsertPrivacyMode, (userId, privacyMode) => ({
      privacyMode,
      userId,
    }))
    const { events, logger } = recordingLogger()

    await expect(updatePrivacy(testDeps({ db, logger }), 2, true)).resolves.toStrictEqual({
      type: 'SUCCESS',
      value: { privacyMode: true, userId: 2 },
    })
    expect(events.map((e) => e.event)).toStrictEqual([
      'user.update_privacy.attempt',
      'user.update_privacy.success',
    ])
  })

  it.each([
    { case: 'the statement fails', event: 'user.update_privacy.failed', impl: () => fail() },
    { case: 'no row comes back', event: 'user.update_privacy.empty_result', impl: () => null },
  ])('is a server error when $case', async ({ event, impl }) => {
    expect.hasAssertions()

    const db = createFakeDb().on(upsertPrivacyMode, impl)
    const { events, logger } = recordingLogger()

    await expect(updatePrivacy(testDeps({ db, logger }), 2, false)).resolves.toStrictEqual({
      type: 'SERVER_ERROR',
    })
    expect(events.at(-1)).toMatchObject({ event, level: 50 })
  })

  it('tells a signed-out caller to log in', async () => {
    expect.hasAssertions()

    const db = createFakeDb()
    const { events, logger } = recordingLogger()

    await expect(
      updatePrivacyModeProcedure(
        { deps: testDeps({ db, logger }), user: null },
        { privacyMode: true },
      ),
    ).resolves.toStrictEqual({ message: 'You must be logged in to continue.', type: 'AUTH_ERROR' })
    expect(db.calls).toStrictEqual([])
    expect(events.map((e) => e.event)).toStrictEqual(['user.update_privacy.unauthorized'])
  })
})
