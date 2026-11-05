import { eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/neon-http'
import { describe, expect, expectTypeOf, it } from 'vitest'

import type { Db, QueryResult } from './db.server'
import { defineQuery, first, firstOrNull, nothing, rows } from './db.server'
import type { User } from './schema.server'
import { funds, transactions, users } from './schema.server'
import { createFakeDb } from './testing/fake-db'

const sql = drizzle.mock({ casing: 'snake_case' })

const findUserByEmail = defineQuery(
  'users.findByEmail',
  (handle, email: User['email']) =>
    handle
      .select({ email: users.email, id: users.id, status: users.status })
      .from(users)
      .where(eq(users.email, email)),
  firstOrNull,
)

const fundNames = defineQuery(
  'funds.names',
  (handle, ids: readonly string[]) =>
    handle
      .select({ id: funds.id, name: funds.name })
      .from(funds)
      .where(inArray(funds.id, [...ids])),
  rows,
)

const insertPending = defineQuery(
  'transactions.insertPending',
  (handle, userId: User['id'], amount: number) =>
    handle
      .insert(transactions)
      .values({ amount, createdAs: 'user', status: 'pending', userId })
      .returning({ id: transactions.id, status: transactions.status }),
  first,
)

const activateUser = defineQuery(
  'users.activate',
  (handle, userId: User['id']) =>
    handle.update(users).set({ status: 'active' }).where(eq(users.id, userId)),
  nothing,
)

describe('a query value', () => {
  it('carries its name, arguments and factory without running', () => {
    expect.hasAssertions()

    const query = findUserByEmail('donor@give.test')

    expect(query).toMatchObject({ args: ['donor@give.test'], name: 'users.findByEmail' })
    expect(query.def).toBe(findUserByEmail)
    expect(findUserByEmail.queryName).toBe('users.findByEmail')
  })

  it('builds the statement against the handle it is given', () => {
    expect.hasAssertions()

    expect(findUserByEmail('donor@give.test').build(sql).toSQL()).toStrictEqual({
      params: ['donor@give.test'],
      sql: 'select "email", "id", "status" from "users" where "users"."email" = $1',
    })
  })
})

describe('decoders', () => {
  const row = { id: 'T1', status: 'pending' as const }

  it('firstOrNull answers the first row or null', () => {
    expect.hasAssertions()

    expect(findUserByEmail('a').decode([])).toBeNull()
    expect(insertPending(1, 100).decode([row, { id: 'T2' }])).toBe(row)
  })

  it('first rejects a statement that returned nothing', () => {
    expect.hasAssertions()

    expect(() => insertPending(1, 100).decode([])).toThrow('returned none')
  })

  it('rows passes rows through unchanged', () => {
    expect.hasAssertions()

    const all = [{ id: 'f1', name: 'Tithe' }]

    expect(fundNames(['f1']).decode(all)).toBe(all)
  })
})

describe('query types', () => {
  it('derive each row type from the statement and its decoder', () => {
    expect.hasAssertions()

    expectTypeOf<QueryResult<typeof findUserByEmail>>().toEqualTypeOf<{
      email: string
      id: number
      status: User['status']
    } | null>()
    expectTypeOf<QueryResult<typeof fundNames>>().toEqualTypeOf<{ id: string; name: string }[]>()
    expectTypeOf<QueryResult<typeof insertPending>>().toEqualTypeOf<{
      id: string
      status: 'failed' | 'pending' | 'success'
    }>()
    expectTypeOf<QueryResult<typeof activateUser>>().toEqualTypeOf<undefined>()

    // @ts-expect-error the factory takes an email string
    findUserByEmail(42)
    // @ts-expect-error the factory takes exactly its declared arguments
    insertPending(1)

    expect(findUserByEmail.queryName).toBe('users.findByEmail')
  })

  it('give batch results as a typed tuple', async () => {
    expect.hasAssertions()

    const db: Db = createFakeDb()
      .on(findUserByEmail, (email) => ({ email, id: 7, status: 'active' }))
      .on(fundNames, () => [{ id: 'f1', name: 'Tithe' }])
      .on(insertPending, () => ({ id: 'T1', status: 'pending' }))

    const results = await db.batch([
      findUserByEmail('donor@give.test'),
      fundNames(['f1']),
      insertPending(7, 100),
    ])
    const [user, names, created] = results

    expectTypeOf(user).not.toBeAny()
    expectTypeOf(user).toEqualTypeOf<QueryResult<typeof findUserByEmail>>()
    expectTypeOf(names).toEqualTypeOf<{ id: string; name: string }[]>()
    expectTypeOf(created.status).toEqualTypeOf<'failed' | 'pending' | 'success'>()
    // @ts-expect-error the user may be null
    expect(user.email).toBe('donor@give.test')
    // @ts-expect-error a three-query batch has no fourth result
    expect(results[3]).toBeUndefined()
    // @ts-expect-error a batch needs at least one query
    await expect(db.batch([])).resolves.toStrictEqual([])

    expect([user, names, created]).toStrictEqual([
      { email: 'donor@give.test', id: 7, status: 'active' },
      [{ id: 'f1', name: 'Tithe' }],
      { id: 'T1', status: 'pending' },
    ])
  })
})
