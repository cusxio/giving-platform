import { Result } from 'better-result'
import { describe, expect, it } from 'vitest'

import type { Db } from '#/server/db.server'
import { defineQuery, rows } from '#/server/db.server'
import { infra } from '#/server/infra-error'
import { legacyDb } from '#/server/legacy-db.server'
import { users } from '#/server/schema.server'
import { createFakeDb } from '#/server/testing/fake-db'

const touch = defineQuery('test.touch', (sql) => sql.select({ id: users.id }).from(users), rows)

/** A port whose every call fails with `cause`, as `createDb` reports a driver failure. */
function failingDb(cause: unknown): Db {
  const failed = () => Promise.resolve(Result.err(infra('test.touch', cause)))
  return {
    batch: failed,
    run: failed,
    transaction: () => Promise.resolve(Result.err(infra('db.transaction', cause))),
  }
}

describe('the legacy adapter', () => {
  it('rethrows the same object the port failed with', async () => {
    expect.hasAssertions()

    const cause = new Error('connection terminated')
    const db = legacyDb(failingDb(cause))

    await expect(db.run(touch())).rejects.toBe(cause)
    await expect(db.batch([touch()])).rejects.toBe(cause)
    await expect(db.transaction(() => Promise.resolve(1))).rejects.toBe(cause)
  })

  it('rethrows a throw from transaction work as the same object', async () => {
    expect.hasAssertions()

    const bug = new TypeError('a bug in the work')
    const fake = createFakeDb()

    await expect(legacyDb(fake).transaction(() => Promise.reject(bug))).rejects.toBe(bug)
    expect(fake.transactions).toStrictEqual(['rollback'])
  })
})
