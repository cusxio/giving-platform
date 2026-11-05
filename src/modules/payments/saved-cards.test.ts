import { describe, expect, expectTypeOf, it } from 'vitest'

import { createFakeDb } from '#/server/testing/fake-db'
import { recordingLogger } from '#/server/testing/recording-logger'
import { okValue } from '#/server/testing/result'
import { MEMBER, testContext } from '#/server/testing/test-context'

import type { getSavedPaymentMethods } from './payments.functions'
import { unexpiredSavedCards } from './saved-cards.repository.server'
import { getSavedPaymentMethodsAction, listSavedCards } from './saved-cards.server'

function fail(): never {
  throw new Error('connection terminated')
}

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

describe('saved cards', () => {
  it("lists the user's unexpired cards as the query returns them", async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(unexpiredSavedCards, () => [card])

    expect(okValue(await listSavedCards({ db }, 2))).toStrictEqual([card])
    expect(db.calls).toStrictEqual([{ args: [2], name: 'payments.unexpiredSavedCards' }])
  })

  it('answers the cards of the signed-in user', async () => {
    expect.hasAssertions()

    expectTypeOf<Awaited<ReturnType<typeof getSavedPaymentMethods>>>().toEqualTypeOf<
      {
        cardExp: string
        cardHolder: string | null
        cardNoMask: string
        cardType: string
        createdAt: Date
        id: number
        lastUsedAt: Date | null
        token: string
        tokenType: 'OCP'
        updatedAt: Date
        userId: number
      }[]
    >()
    const db = createFakeDb().on(unexpiredSavedCards, () => [card])

    await expect(
      getSavedPaymentMethodsAction({ context: testContext(MEMBER, { db }) }),
    ).resolves.toStrictEqual([card])
    expect(db.calls).toStrictEqual([{ args: [2], name: 'payments.unexpiredSavedCards' }])
  })

  it('is empty for a signed-out caller, without a query', async () => {
    expect.hasAssertions()

    const db = createFakeDb()

    await expect(
      getSavedPaymentMethodsAction({ context: testContext(null, { db }) }),
    ).resolves.toStrictEqual([])
    expect(db.calls).toStrictEqual([])
  })

  it('logs a failed read once and throws a generic error', async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(unexpiredSavedCards, fail)
    const { events, logger } = recordingLogger()

    await expect(
      getSavedPaymentMethodsAction({ context: testContext(MEMBER, { db, logger }) }),
    ).rejects.toThrow(new Error('Internal Server Error'))
    expect(events).toMatchObject([
      {
        event: 'giving.saved_payment_methods.failed',
        level: 50,
        op: unexpiredSavedCards.queryName,
      },
    ])
  })
})
