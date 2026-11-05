import { isNotFound, isRedirect } from '@tanstack/react-router'
import { describe, expect, expectTypeOf, it } from 'vitest'

import type { AuthErrorResponse, ServerErrorResponse, ValidationErrorResponse } from '#/core/wire'
import { hasGuestTransaction } from '#/modules/payments/server'
import { createDriverDb } from '#/server/testing/driver-db'
import { createFakeDb } from '#/server/testing/fake-db'
import { recordingLogger } from '#/server/testing/recording-logger'
import { errValue, okValue } from '#/server/testing/result'
import { MEMBER, testContext } from '#/server/testing/test-context'

import { AccountNotFound } from './account.errors'
import type { getCurrentUser, getWelcome, updatePrivacyMode, updateUser } from './account.functions'
import type { UpdatePrivacyModeInput, UpdateUserInput } from './account.server'
import {
  getCurrentUserAction,
  getWelcomeAction,
  loadCurrentUser,
  loadWelcome,
  updatePrivacy,
  updatePrivacyModeAction,
  updateProfile,
  updateUserAction,
} from './account.server'
import type { UserSettings } from './user-settings.repository.server'
import { findSettingsByUserId, upsertPrivacyMode } from './user-settings.repository.server'
import type { User } from './users.repository.server'
import { findUserById, updateUserById, upsertGuestUser } from './users.repository.server'

const DEBUG = 20
const INFO = 30
const WARN = 40
const ERROR = 50

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

const signedOut = { message: 'You must be logged in to continue.', type: 'AUTH_ERROR' }

describe('the current user', () => {
  it('comes with their saved settings, in one round trip', async () => {
    expect.hasAssertions()

    const db = createFakeDb()
      .on(findUserById, () => user)
      .on(findSettingsByUserId, (userId) => ({ privacyMode: true, userId }))

    expect(okValue(await loadCurrentUser({ db }, 2))).toStrictEqual({
      user,
      userSettings: { privacyMode: true, userId: 2 },
    })
    expect(db.roundTrips).toStrictEqual([[findUserById.queryName, findSettingsByUserId.queryName]])
  })

  it('gets privacy mode off when they never saved settings', async () => {
    expect.hasAssertions()

    const db = createFakeDb()
      .on(findUserById, () => user)
      .on(findSettingsByUserId, () => null)

    expect(okValue(await loadCurrentUser({ db }, 2))).toStrictEqual({
      user,
      userSettings: { privacyMode: false, userId: 2 },
    })
  })

  it('is not found when the session outlived the account row', async () => {
    expect.hasAssertions()

    const db = createFakeDb()
      .on(findUserById, () => null)
      .on(findSettingsByUserId, () => null)

    const error = errValue(await loadCurrentUser({ db }, 2))
    expect(error).toBeInstanceOf(AccountNotFound)
    expect(error).toMatchObject({ userId: 2 })
  })

  it('answers SUCCESS, or AUTH_ERROR to a guest and to a session without an account', async () => {
    expect.hasAssertions()

    expectTypeOf<Awaited<ReturnType<typeof getCurrentUser>>>().toEqualTypeOf<
      | ServerErrorResponse
      | { readonly type: 'AUTH_ERROR' }
      | { type: 'SUCCESS'; value: { user: User; userSettings: UserSettings } }
    >()
    const found = createFakeDb()
      .on(findUserById, () => user)
      .on(findSettingsByUserId, () => null)
    const gone = createFakeDb()
      .on(findUserById, () => null)
      .on(findSettingsByUserId, () => null)
    const { events, logger } = recordingLogger()

    await expect(
      getCurrentUserAction({ context: testContext(MEMBER, { db: found }) }),
    ).resolves.toStrictEqual({
      type: 'SUCCESS',
      value: { user, userSettings: { privacyMode: false, userId: 2 } },
    })
    await expect(
      getCurrentUserAction({ context: testContext(null, { db: found, logger }) }),
    ).resolves.toStrictEqual({ type: 'AUTH_ERROR' })
    await expect(
      getCurrentUserAction({ context: testContext(MEMBER, { db: gone, logger }) }),
    ).resolves.toStrictEqual({ type: 'AUTH_ERROR' })
    expect(events).toMatchObject([
      { event: 'auth.get_user.guest', level: DEBUG, msg: 'No session found, returning AUTH_ERROR' },
      {
        event: 'auth.get_user.integrity_failed',
        level: WARN,
        msg: 'Session valid but user not found in DB',
        user_id: 2,
      },
    ])
    expect(found.roundTrips).toHaveLength(1)
  })

  it('answers SERVER_ERROR when the read fails, and logs it once', async () => {
    expect.hasAssertions()

    const db = createFakeDb()
      .on(findUserById, () => user)
      .on(findSettingsByUserId, fail)
    const { events, logger } = recordingLogger()

    await expect(
      getCurrentUserAction({ context: testContext(MEMBER, { db, logger }) }),
    ).resolves.toStrictEqual({ type: 'SERVER_ERROR' })
    expect(events).toMatchObject([
      {
        event: 'auth.get_user.failed',
        level: ERROR,
        op: `${findUserById.queryName} + ${findSettingsByUserId.queryName}`,
      },
    ])
  })
})

describe('the welcome data', () => {
  it.each([true, false])('reports guestTransactionExists=%s', async (exists) => {
    expect.hasAssertions()

    const db = createFakeDb()
      .on(findUserById, () => user)
      .on(hasGuestTransaction, () => exists)

    expect(okValue(await loadWelcome({ db }, 2))).toStrictEqual({
      guestTransactionExists: exists,
      user,
    })
    expect(db.roundTrips).toStrictEqual([[findUserById.queryName, hasGuestTransaction.queryName]])
  })

  it('answers the signed-in user, redirects a guest to login, and hides a missing account', async () => {
    expect.hasAssertions()

    expectTypeOf<Awaited<ReturnType<typeof getWelcome>>>().toEqualTypeOf<{
      guestTransactionExists: boolean
      user: User
    }>()
    const found = createFakeDb()
      .on(findUserById, () => user)
      .on(hasGuestTransaction, () => false)
    const gone = createFakeDb()
      .on(findUserById, () => null)
      .on(hasGuestTransaction, () => true)

    await expect(
      getWelcomeAction({ context: testContext(MEMBER, { db: found }) }),
    ).resolves.toStrictEqual({ guestTransactionExists: false, user })
    const guest = await getWelcomeAction({ context: testContext(null, { db: found }) }).catch(
      (error: unknown) => error,
    )
    const missing = await getWelcomeAction({ context: testContext(MEMBER, { db: gone }) }).catch(
      (error: unknown) => error,
    )

    expect(isRedirect(guest)).toBe(true)
    expect(guest).toMatchObject({ options: { to: '/auth/login' } })
    expect(isNotFound(missing)).toBe(true)
    expect(found.roundTrips).toHaveLength(1)
  })

  it('logs a failed read and answers a generic error', async () => {
    expect.hasAssertions()

    const db = createFakeDb()
      .on(findUserById, () => user)
      .on(hasGuestTransaction, fail)
    const { events, logger } = recordingLogger()

    await expect(
      getWelcomeAction({ context: testContext(MEMBER, { db, logger }) }),
    ).rejects.toThrow(new Error('Internal Server Error'))
    expect(events).toMatchObject([{ event: 'user.get_welcome.failed', level: ERROR }])
  })
})

describe('updating the profile', () => {
  it('saves the given fields and logs the attempt and the success', async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(updateUserById, (_id, changes) => ({ ...user, ...changes }))
    const { events, logger } = recordingLogger()

    expect(
      okValue(await updateProfile({ db, logger }, 2, { firstName: 'Ada', lastName: 'Lovelace' })),
    ).toStrictEqual({ user: { ...user, firstName: 'Ada', lastName: 'Lovelace' } })
    expect(db.calls).toStrictEqual([
      { args: [2, { firstName: 'Ada', lastName: 'Lovelace' }], name: updateUserById.queryName },
    ])
    expect(events).toMatchObject([
      {
        event: 'user.update_user.attempt',
        fields: ['firstName', 'lastName'],
        level: INFO,
        user_id: 2,
      },
      { event: 'user.update_user.success', level: INFO, user_id: 2 },
    ])
  })

  it('trims the names before it validates them, and answers SUCCESS with the saved row', async () => {
    expect.hasAssertions()

    expectTypeOf<UpdateUserInput>().toEqualTypeOf<{
      firstName?: string
      journey?: 'migrate' | 'start_fresh'
      lastName?: string
    }>()
    expectTypeOf<Awaited<ReturnType<typeof updateUser>>>().toEqualTypeOf<
      | AuthErrorResponse<'You must be logged in to continue.'>
      | ServerErrorResponse
      | ValidationErrorResponse
      | { type: 'SUCCESS'; value: { user: User } }
    >()
    const db = createFakeDb().on(updateUserById, (_id, changes) => ({ ...user, ...changes }))

    await expect(
      updateUserAction({
        context: testContext(MEMBER, { db }),
        data: { firstName: '  Ada ', lastName: 'Lovelace  ' },
      }),
    ).resolves.toStrictEqual({
      type: 'SUCCESS',
      value: { user: { ...user, firstName: 'Ada', lastName: 'Lovelace' } },
    })
    expect(db.calls).toStrictEqual([
      { args: [2, { firstName: 'Ada', lastName: 'Lovelace' }], name: updateUserById.queryName },
    ])
  })

  it.each([
    { case: 'a blank name', data: { firstName: '   ', lastName: 'Lovelace' } },
    { case: 'an unknown journey', data: { journey: 'nope' } },
    { case: 'a body that is not an object', data: 42 },
  ])('answers VALIDATION_ERROR to $case without touching the database', async ({ data }) => {
    expect.hasAssertions()

    const db = createFakeDb()
    const { events, logger } = recordingLogger()

    await expect(
      updateUserAction({ context: testContext(MEMBER, { db, logger }), data }),
    ).resolves.toMatchObject({ type: 'VALIDATION_ERROR' })
    expect(db.calls).toStrictEqual([])
    expect(events).toMatchObject([{ event: 'user.update_user.validation_failed', level: WARN }])
  })

  it('names the field a blank name fails on', async () => {
    expect.hasAssertions()

    await expect(
      updateUserAction({
        context: testContext(MEMBER, { db: createFakeDb() }),
        data: { firstName: '   ', lastName: 'Lovelace' },
      }),
    ).resolves.toStrictEqual({
      errors: [{ message: 'must not have fewer than 1 characters', path: '/firstName' }],
      type: 'VALIDATION_ERROR',
    })
  })

  it.each([
    { case: 'the statement fails', impl: fail, type: 'Error' },
    { case: 'no row comes back', impl: () => null, type: 'no-row' },
  ])('answers SERVER_ERROR when $case, and logs it once', async ({ impl, type }) => {
    expect.hasAssertions()

    const db = createFakeDb().on(updateUserById, impl)
    const { events, logger } = recordingLogger()

    await expect(
      updateUserAction({
        context: testContext(MEMBER, { db, logger }),
        data: { journey: 'start_fresh' },
      }),
    ).resolves.toStrictEqual({ type: 'SERVER_ERROR' })
    expect(events.map((line) => line.event)).toStrictEqual([
      'user.update_user.attempt',
      'user.update_user.failed',
    ])
    expect(events[1]).toMatchObject({
      'error.type': type,
      level: ERROR,
      op: updateUserById.queryName,
    })
  })

  it('tells a signed-out caller to log in, without touching the database', async () => {
    expect.hasAssertions()

    const db = createFakeDb()
    const { events, logger } = recordingLogger()

    await expect(
      updateUserAction({ context: testContext(null, { db, logger }), data: { firstName: 'Ada' } }),
    ).resolves.toStrictEqual(signedOut)
    expect(db.calls).toStrictEqual([])
    expect(events).toMatchObject([{ event: 'user.update_user.unauthorized', level: WARN }])
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

    expect(okValue(await updatePrivacy({ db, logger }, 2, true))).toStrictEqual({
      privacyMode: true,
      userId: 2,
    })
    expect(events).toMatchObject([
      { event: 'user.update_privacy.attempt', level: INFO, privacy_mode: true },
      { event: 'user.update_privacy.success', level: INFO },
    ])
  })

  it('answers SUCCESS with the saved row', async () => {
    expect.hasAssertions()

    expectTypeOf<UpdatePrivacyModeInput>().toEqualTypeOf<{ privacyMode: boolean }>()
    expectTypeOf<Awaited<ReturnType<typeof updatePrivacyMode>>>().toEqualTypeOf<
      | AuthErrorResponse<'You must be logged in to continue.'>
      | ServerErrorResponse
      | ValidationErrorResponse
      | { type: 'SUCCESS'; value: UserSettings }
    >()
    const db = createFakeDb().on(upsertPrivacyMode, (userId, privacyMode) => ({
      privacyMode,
      userId,
    }))

    await expect(
      updatePrivacyModeAction({
        context: testContext(MEMBER, { db }),
        data: { privacyMode: false },
      }),
    ).resolves.toStrictEqual({ type: 'SUCCESS', value: { privacyMode: false, userId: 2 } })
  })

  it.each([{ privacyMode: 'yes' }, {}, null])(
    'answers VALIDATION_ERROR to %j without touching the database',
    async (data) => {
      expect.hasAssertions()

      const db = createFakeDb()
      const { events, logger } = recordingLogger()

      await expect(
        updatePrivacyModeAction({ context: testContext(MEMBER, { db, logger }), data }),
      ).resolves.toMatchObject({ type: 'VALIDATION_ERROR' })
      expect(db.calls).toStrictEqual([])
      expect(events).toMatchObject([{ event: 'user.update_privacy.validation_failed' }])
    },
  )

  it.each([
    { case: 'the statement fails', impl: fail, type: 'Error' },
    { case: 'no row comes back', impl: () => null, type: 'no-row' },
  ])('answers SERVER_ERROR when $case, and logs it once', async ({ impl, type }) => {
    expect.hasAssertions()

    const db = createFakeDb().on(upsertPrivacyMode, impl)
    const { events, logger } = recordingLogger()

    await expect(
      updatePrivacyModeAction({
        context: testContext(MEMBER, { db, logger }),
        data: { privacyMode: false },
      }),
    ).resolves.toStrictEqual({ type: 'SERVER_ERROR' })
    expect(events.map((line) => line.event)).toStrictEqual([
      'user.update_privacy.attempt',
      'user.update_privacy.failed',
    ])
    expect(events[1]).toMatchObject({
      'error.type': type,
      level: ERROR,
      op: upsertPrivacyMode.queryName,
    })
  })

  it('tells a signed-out caller to log in, without touching the database', async () => {
    expect.hasAssertions()

    const db = createFakeDb()
    const { events, logger } = recordingLogger()

    await expect(
      updatePrivacyModeAction({
        context: testContext(null, { db, logger }),
        data: { privacyMode: true },
      }),
    ).resolves.toStrictEqual(signedOut)
    expect(db.calls).toStrictEqual([])
    expect(events).toMatchObject([{ event: 'user.update_privacy.unauthorized', level: WARN }])
  })
})

describe('the guest upsert', () => {
  it('fills in only the names a guest lacks, and changes no registered account', async () => {
    expect.hasAssertions()

    const statements: { params: unknown[]; sql: string }[] = []
    const db = createDriverDb((sql, params) => {
      statements.push({ params, sql })
      return Promise.resolve({ rowCount: 0, rows: [] })
    })

    expect(
      okValue(
        await db.run(
          upsertGuestUser({ email: 'guest@give.test', firstName: 'Gia', lastName: 'Guest' }),
        ),
      ),
    ).toBeNull()
    expect(statements).toStrictEqual([
      {
        params: ['guest@give.test', 'Gia', 'Guest', 'user', 'guest', expect.any(String), 'guest'],
        sql: [
          'insert into "users" ("id", "email", "email_verified_at", "first_name", "last_name", "role", "status", "journey", "created_at", "updated_at") values (default, $1, default, $2, $3, $4, $5, default, default, default)',
          'on conflict ("email") do update set "first_name" = coalesce("users"."first_name", excluded.first_name), "last_name" = coalesce("users"."last_name", excluded.last_name), "updated_at" = $6 where "users"."status" = $7',
          'returning "id", "email", "email_verified_at", "first_name", "last_name", "role", "status", "journey", "created_at", "updated_at"',
        ].join(' '),
      },
    ])
  })
})
