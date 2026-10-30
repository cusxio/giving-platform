import { describe, expect, it } from 'vitest'

import { hasGuestTransaction } from '#/modules/payments/server'
import { createFakeDb } from '#/server/testing/fake-db'
import { testDeps } from '#/server/testing/test-deps'

import { loadCurrentUser, loadWelcome } from './account.server'
import { findSettingsByUserId } from './user-settings.repository.server'
import { findUserById } from './users.repository.server'

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
