import { describe, expect, it } from 'vitest'

import { createFakeDb } from '#/server/testing/fake-db'
import { testDeps } from '#/server/testing/test-deps'

import { unexpiredSavedCards } from './saved-cards.repository.server'
import { getSavedPaymentMethodsProcedure, listSavedCards } from './saved-cards.server'

const card = {
  cardExp: '209912',
  cardHolder: 'ADA LOVELACE',
  cardNoMask: '411111******1111',
  cardType: 'VISA',
  createdAt: new Date('2026-10-01T10:00:00Z'),
  id: 7,
  lastUsedAt: new Date('2026-10-20T10:00:00Z'),
  token: 'tok_visa',
  tokenType: 'OCP' as const,
  updatedAt: new Date('2026-10-01T10:00:00Z'),
  userId: 2,
}

const signedIn = {
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

describe('saved cards', () => {
  it("lists the user's unexpired cards as the query returns them", async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(unexpiredSavedCards, () => [card])

    await expect(listSavedCards({ db }, 2)).resolves.toStrictEqual([card])
    expect(db.calls).toStrictEqual([{ args: [2], name: 'payments.unexpiredSavedCards' }])
  })

  it('reads the cards of the signed-in user', async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(unexpiredSavedCards, () => [card])

    await expect(
      getSavedPaymentMethodsProcedure({ deps: testDeps({ db }), user: signedIn }),
    ).resolves.toStrictEqual([card])
    expect(db.calls).toStrictEqual([{ args: [2], name: 'payments.unexpiredSavedCards' }])
  })

  it('is empty for a signed-out caller, without a query', async () => {
    expect.hasAssertions()

    const db = createFakeDb()

    await expect(
      getSavedPaymentMethodsProcedure({ deps: testDeps({ db }), user: null }),
    ).resolves.toStrictEqual([])
    expect(db.calls).toStrictEqual([])
  })
})
