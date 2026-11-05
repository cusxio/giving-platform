import { drizzle } from 'drizzle-orm/neon-http'

import type { Db } from '#/server/db.server'
import { createDb } from '#/server/db.server'
import type { DBPool } from '#/server/neon.server'

/** Stands in for the neon-http driver: receives each statement's SQL text and params. */
type Driver = (sql: string, params: unknown[]) => Promise<unknown>

const noPool = {
  transaction: () => Promise.reject(new Error('createDriverDb has no pool')),
} as unknown as DBPool

/**
 * The production Db over a neon-http handle that sends every statement to `driver`, so a test
 * can pin exact SQL and params. `transaction` rejects; fake it with createFakeDb instead.
 */
export function createDriverDb(driver: Driver): Db {
  return createDb(drizzle({ casing: 'snake_case', client: driver as never }), noPool)
}
