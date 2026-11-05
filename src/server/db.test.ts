import { Result } from 'better-result'
import { eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/neon-http'
import { describe, expect, expectTypeOf, it } from 'vitest'

import type { Db, QueryResult, Sql } from './db.server'
import { createDb, defineQuery, firstOrNull, nothing, rows } from './db.server'
import { InfraError } from './infra-error'
import type { DBPool } from './neon.server'
import type { User } from './schema.server'
import { funds, transactions, users } from './schema.server'
import { createFakeDb } from './testing/fake-db'
import { errValue, okValue } from './testing/result'

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

/** A decoder that throws, as a decoder may: the port must turn it into an `InfraError`. */
function first<R>(raw: readonly R[]): R {
  const [row] = raw
  if (row === undefined) {
    throw new Error('Expected the statement to return a row, but it returned none')
  }
  return row
}

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

    const results = okValue(
      await db.batch([
        findUserByEmail('donor@give.test'),
        fundNames(['f1']),
        insertPending(7, 100),
      ]),
    )
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
    expect(okValue(await db.batch([]))).toStrictEqual([])

    expect([user, names, created]).toStrictEqual([
      { email: 'donor@give.test', id: 7, status: 'active' },
      [{ id: 'f1', name: 'Tithe' }],
      { id: 'T1', status: 'pending' },
    ])
  })
})

/** neon-http over `driver`: each statement's SQL reaches it, and a batch reaches `transaction`. */
function httpOver(
  driver: (sql: string, params: unknown[]) => Promise<unknown>,
  batch: () => Promise<unknown> = () => Promise.reject(new Error('no batch')),
) {
  return drizzle({
    casing: 'snake_case',
    client: Object.assign(driver, { transaction: batch }) as never,
  })
}

const http = httpOver(() => Promise.resolve({ rowCount: 0, rows: [] }))

/** A pool whose transaction logs begin, commit and rollback around `work`, like drizzle's. */
function recordingPool(tx: Sql, { failCommit = false, failRollback = false } = {}) {
  const log: string[] = []
  const pool = {
    transaction: async (work: (handle: Sql) => Promise<unknown>) => {
      log.push('begin')
      try {
        const result = await work(tx)
        if (failCommit) {
          throw new Error('commit failed')
        }
        log.push('commit')
        return result
      } catch (error) {
        log.push('rollback')
        if (failRollback) {
          throw new Error('rollback failed', { cause: error })
        }
        throw error
      }
    },
  }
  return { log, pool: pool as unknown as DBPool }
}

describe('the db port', () => {
  it('answers Ok with the decoded rows', async () => {
    expect.hasAssertions()

    const db = createDb(
      httpOver(() => Promise.resolve({ rowCount: 1, rows: [['donor@give.test', 7, 'active']] })),
      recordingPool(http).pool,
    )

    expect(okValue(await db.run(findUserByEmail('donor@give.test')))).toStrictEqual({
      email: 'donor@give.test',
      id: 7,
      status: 'active',
    })
  })

  it('answers a failed statement with an InfraError carrying the driver error', async () => {
    expect.hasAssertions()

    const boom = new Error('connection terminated')
    const db = createDb(
      httpOver(() => Promise.reject(boom)),
      recordingPool(http).pool,
    )
    const error = errValue(await db.run(findUserByEmail('donor@give.test')))

    expect(error).toBeInstanceOf(InfraError)
    expect(error).toMatchObject({ op: 'users.findByEmail', reason: 'failed' })
    expect(error.cause).toMatchObject({ cause: boom })
  })

  it('answers a decoder failure with an InfraError', async () => {
    expect.hasAssertions()

    const db = createDb(http, recordingPool(http).pool)
    const error = errValue(await db.run(insertPending(1, 100)))

    expect(error).toMatchObject({ op: 'transactions.insertPending' })
    expect(error.cause).toStrictEqual(
      new Error('Expected the statement to return a row, but it returned none'),
    )
  })

  it('names a failed batch after all of its queries', async () => {
    expect.hasAssertions()

    const boom = new Error('batch failed')
    const db = createDb(
      httpOver(
        () => Promise.resolve({ rowCount: 0, rows: [] }),
        () => Promise.reject(boom),
      ),
      recordingPool(http).pool,
    )
    const error = errValue(await db.batch([findUserByEmail('a@give.test'), fundNames(['f1'])]))

    expect(error).toMatchObject({ op: 'users.findByEmail + funds.names' })
    expect(error.cause).toBe(boom)
  })
})

describe('a db transaction', () => {
  it('commits on Ok and returns it', async () => {
    expect.hasAssertions()

    const { log, pool } = recordingPool(http)
    const result = await createDb(http, pool).transaction(() => Promise.resolve(Result.ok(5)))

    expect(okValue(result)).toBe(5)
    expect(log).toStrictEqual(['begin', 'commit'])
  })

  it('rolls back on Err and returns that Err as it was', async () => {
    expect.hasAssertions()

    const { log, pool } = recordingPool(http)
    const refused = new Error('refused')
    const result = await createDb(http, pool).transaction(() =>
      Promise.resolve(Result.err(refused)),
    )

    expect(errValue(result)).toBe(refused)
    expect(log).toStrictEqual(['begin', 'rollback'])
  })

  it('rolls back when a statement fails, stopping the statements after it', async () => {
    expect.hasAssertions()

    const sent: string[] = []
    const boom = new Error('insert failed')
    const tx = httpOver((sql) => {
      sent.push(sql)
      return Promise.reject(boom)
    })
    const { log, pool } = recordingPool(tx)
    const result = await createDb(http, pool).transaction((handle) =>
      handle.batch([insertPending(1, 100), activateUser(1)]),
    )
    const error = errValue(result)

    expect(error).toMatchObject({ op: 'transactions.insertPending' })
    expect(error.cause).toMatchObject({ cause: boom })
    expect(sent).toHaveLength(1)
    expect(log).toStrictEqual(['begin', 'rollback'])
  })

  it('rolls back on a throw and rethrows the same object', async () => {
    expect.hasAssertions()

    const { log, pool } = recordingPool(http)
    const bug = new TypeError('a bug in the work')

    await expect(createDb(http, pool).transaction(() => Promise.reject(bug))).rejects.toBe(bug)
    expect(log).toStrictEqual(['begin', 'rollback'])
  })

  it('answers a failed commit with an InfraError', async () => {
    expect.hasAssertions()

    const { log, pool } = recordingPool(http, { failCommit: true })
    const error = errValue(
      await createDb(http, pool).transaction(() => Promise.resolve(Result.ok(1))),
    )

    expect(error).toMatchObject({ op: 'db.transaction', reason: 'failed' })
    expect(error.cause).toStrictEqual(new Error('commit failed'))
    expect(log).toStrictEqual(['begin', 'rollback'])
  })

  it('keeps the Err that caused a rollback when the rollback fails', async () => {
    expect.hasAssertions()

    const { pool } = recordingPool(http, { failRollback: true })
    const refused = new Error('refused by the work')
    const error = errValue(
      await createDb(http, pool).transaction(() => Promise.resolve(Result.err(refused))),
    )

    expect(error).toMatchObject({ op: 'db.transaction', reason: 'failed', rejected: refused })
    expect(error.cause).toMatchObject({ message: 'rollback failed' })
  })

  it('rethrows a throw from the work even when the rollback after it fails', async () => {
    expect.hasAssertions()

    const { pool } = recordingPool(http, { failRollback: true })
    const bug = new TypeError('a bug in the work')

    await expect(createDb(http, pool).transaction(() => Promise.reject(bug))).rejects.toBe(bug)
  })

  it('answers a failed begin with an InfraError without running the work', async () => {
    expect.hasAssertions()

    const boom = new Error('no connection')
    const pool = { transaction: () => Promise.reject(boom) } as unknown as DBPool
    let ran = false
    const error = errValue(
      await createDb(http, pool).transaction(() => {
        ran = true
        return Promise.resolve(Result.ok(1))
      }),
    )

    expect(error).toMatchObject({ op: 'db.transaction' })
    expect(error.cause).toBe(boom)
    expect(ran).toBe(false)
  })
})
