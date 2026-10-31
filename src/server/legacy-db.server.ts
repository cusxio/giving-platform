import { Result } from 'better-result'

import type { Db, Executor as ResultExecutor, Query, Results } from '#/server/db.server'
import type { InfraError } from '#/server/infra-error'

/**
 * The Phase 1 throwing port, for workflows not yet moved to the Result port. Each module's
 * migration deletes its calls, and the file goes once none are left. Every `Err` rethrows its
 * original `cause`, so a caller sees exactly the error object it saw before.
 */
interface Executor {
  readonly run: <T>(query: Query<T>) => Promise<T>
  readonly batch: <const Q extends readonly [Query<unknown>, ...Query<unknown>[]]>(
    queries: Q,
  ) => Promise<Results<Q>>
}

interface LegacyDb extends Executor {
  /** Throwing inside `work` rolls back and rethrows. */
  readonly transaction: <T>(work: (tx: Executor) => Promise<T>) => Promise<T>
}

function unwrap<T>(result: Result<T, InfraError>): T {
  if (result.isErr()) {
    // oxlint-disable-next-line typescript/only-throw-error -- the driver's own error, unchanged
    throw result.error.cause
  }
  return result.value
}

function throwing(executor: ResultExecutor): Executor {
  return {
    batch: async (queries) => unwrap(await executor.batch(queries)),
    run: async (query) => unwrap(await executor.run(query)),
  }
}

export function legacyDb(db: Db): LegacyDb {
  return {
    ...throwing(db),
    transaction: async (work) =>
      unwrap(await db.transaction(async (tx) => Result.ok(await work(throwing(tx))))),
  }
}
