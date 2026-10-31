import { Result } from 'better-result'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { defineQuery, firstOrNull, nothing } from '#/server/db.server'
import { InfraError } from '#/server/infra-error'
import type { User } from '#/server/schema.server'
import { users } from '#/server/schema.server'

import { createFakeDb } from './fake-db'
import { errValue, okValue } from './result'

const findUserByEmail = defineQuery(
  'users.findByEmail',
  (sql, email: User['email']) =>
    sql.select({ id: users.id, status: users.status }).from(users).where(eq(users.email, email)),
  firstOrNull,
)

const activateUser = defineQuery(
  'users.activate',
  (sql, userId: User['id'], at: Date) =>
    sql.update(users).set({ emailVerifiedAt: at, status: 'active' }).where(eq(users.id, userId)),
  nothing,
)

function fail(): never {
  throw new Error('connection terminated')
}

describe('a fake db', () => {
  it('answers a query with the impl registered for its factory', async () => {
    expect.hasAssertions()

    const db = createFakeDb().on(findUserByEmail, (email) => ({
      id: email.length,
      status: 'active',
    }))

    expect(okValue(await db.run(findUserByEmail('a@give.test')))).toStrictEqual({
      id: 11,
      status: 'active',
    })
    expect(okValue(await db.run(findUserByEmail('long.name@give.test')))).toMatchObject({ id: 19 })
  })

  it('rejects a query nobody answered, naming it', async () => {
    expect.hasAssertions()

    await expect(createFakeDb().run(activateUser(1, new Date(0)))).rejects.toThrow(
      'unexpected query users.activate',
    )
  })

  it('answers an impl that throws with an InfraError named after the query', async () => {
    expect.hasAssertions()

    const at = new Date(0)
    const db = createFakeDb()
      .on(findUserByEmail, () => null)
      .on(activateUser, fail)

    const alone = errValue(await db.run(activateUser(1, at)))
    const batched = errValue(await db.batch([findUserByEmail('a@give.test'), activateUser(1, at)]))
    const inTransaction = errValue(
      await db.transaction((tx) => tx.batch([findUserByEmail('a@give.test'), activateUser(1, at)])),
    )

    expect(alone).toBeInstanceOf(InfraError)
    expect(alone).toMatchObject({ cause: new Error('connection terminated'), op: 'users.activate' })
    expect(batched).toMatchObject({ op: 'users.findByEmail + users.activate' })
    expect(inTransaction).toMatchObject({ op: 'users.activate' })
  })

  it('records every call in order across run, batch and transaction', async () => {
    expect.hasAssertions()

    const at = new Date(0)
    const db = createFakeDb()
      .on(findUserByEmail, () => ({ id: 3, status: 'guest' }))
      .on(activateUser, () => {})

    await db.run(findUserByEmail('a@give.test'))
    await db.batch([findUserByEmail('b@give.test'), activateUser(3, at)])
    await db.transaction((tx) => tx.run(activateUser(4, at)))

    expect(db.calls).toStrictEqual([
      { args: ['a@give.test'], name: 'users.findByEmail' },
      { args: ['b@give.test'], name: 'users.findByEmail' },
      { args: [3, at], name: 'users.activate' },
      { args: [4, at], name: 'users.activate' },
    ])
  })

  it('records one round trip per run and per batch, and per statement inside a transaction', async () => {
    expect.hasAssertions()

    const at = new Date(0)
    const db = createFakeDb()
      .on(findUserByEmail, () => null)
      .on(activateUser, () => {})

    await db.run(findUserByEmail('a@give.test'))
    await db.batch([findUserByEmail('b@give.test'), activateUser(3, at)])
    await db.transaction(async (tx) => {
      await tx.batch([findUserByEmail('c@give.test'), activateUser(4, at)])
      return tx.run(activateUser(5, at))
    })

    expect(db.roundTrips).toStrictEqual([
      ['users.findByEmail'],
      ['users.findByEmail', 'users.activate'],
      ['users.findByEmail'],
      ['users.activate'],
      ['users.activate'],
    ])
  })

  it('records whether each transaction committed or rolled back', async () => {
    expect.hasAssertions()

    const db = createFakeDb()
    const bug = new Error('a bug in the work')

    await db.transaction(() => Promise.resolve(Result.ok(1)))
    await db.transaction(() => Promise.resolve(Result.err(new Error('refused'))))
    await expect(db.transaction(() => Promise.reject(bug))).rejects.toBe(bug)

    expect(db.transactions).toStrictEqual(['commit', 'rollback', 'rollback'])
  })

  it('types each impl from the real query factory', () => {
    expect.hasAssertions()

    const db = createFakeDb()
    // @ts-expect-error the impl must answer the decoded row type
    db.on(findUserByEmail, () => ({ id: 'not-a-number', status: 'active' }))
    // @ts-expect-error the impl receives the factory's arguments
    db.on(activateUser, (userId: string) => userId)
    // @ts-expect-error the status must be one of the schema enum's values
    db.on(findUserByEmail, () => ({ id: 3, status: 'banned' }))
    // @ts-expect-error the query answers a row or null, never nothing
    db.on(findUserByEmail, () => {})

    expect(db.calls).toStrictEqual([])
  })
})
