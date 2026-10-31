import { Result } from 'better-result'
import { DrizzleQueryError } from 'drizzle-orm'

import type { Db, Executor, Query, QueryDef, Results } from '#/server/db.server'
import { batchOp } from '#/server/db.server'
import type { InfraError } from '#/server/infra-error'
import { infra } from '#/server/infra-error'

interface QueryCall {
  readonly args: readonly unknown[]
  readonly name: string
}

export interface FakeDb extends Db {
  /**
   * Answers every run of `def` with `impl`. An `impl` that throws is a failed statement:
   * `Err(InfraError)` named after the query. Its `cause` has production's shape: drizzle wraps
   * the driver error in a `DrizzleQueryError` that quotes the arguments, except in a neon-http
   * batch, which fails with the driver error itself. A query with no answer rejects with
   * `unexpected query <name>`, because it is a bug in the test. `NoInfer` fixes the row type
   * from `def`, so an impl cannot widen it.
   */
  readonly on: <A extends unknown[], T>(
    def: QueryDef<A, T>,
    impl: NoInfer<(...args: A) => T>,
  ) => FakeDb
  /** Every query run so far, in order, including those inside batches and transactions. */
  readonly calls: readonly QueryCall[]
  /**
   * The query names each database round trip carried, as `createDb` sends them: one per `run`,
   * one per `batch`, and one per statement inside a transaction.
   */
  readonly roundTrips: readonly (readonly string[])[]
  /** How each transaction ended: `commit` after `Ok`, `rollback` after `Err` or a throw. */
  readonly transactions: readonly ('commit' | 'rollback')[]
}

type Impl = (...args: readonly unknown[]) => unknown

export function createFakeDb(): FakeDb {
  const impls = new Map<QueryDef<never, unknown>, Impl>()
  const calls: QueryCall[] = []
  const roundTrips: string[][] = []
  const transactions: ('commit' | 'rollback')[] = []

  const answer = <T>(query: Query<T>, wrapped = true): Promise<Result<T, InfraError>> => {
    calls.push({ args: query.args, name: query.name })
    const impl = impls.get(query.def)
    if (impl === undefined) {
      return Promise.reject(new Error(`unexpected query ${query.name}`))
    }
    // Answers a tick later, as a driver would.
    return Promise.resolve().then((): Result<T, InfraError> => {
      try {
        return Result.ok(impl(...query.args) as T)
      } catch (error) {
        const cause = wrapped
          ? new DrizzleQueryError(`fake ${query.name}`, [...query.args], error as Error)
          : error
        return Result.err(infra(query.name, cause))
      }
    })
  }

  /** Answers in order and stops at the first failure, which carries `op`. */
  const answerAll = async <const Q extends readonly Query<unknown>[]>(
    queries: Q,
    op: (failed: Query<unknown>) => string,
    wrapped: boolean,
  ): Promise<Result<Results<Q>, InfraError>> => {
    const results: unknown[] = []
    for (const query of queries) {
      // oxlint-disable-next-line no-await-in-loop -- calls must record in statement order
      const result = await answer(query, wrapped)
      if (result.isErr()) {
        return Result.err(infra(op(query), result.error.cause))
      }
      results.push(result.value)
    }
    return Result.ok(results as Results<Q>)
  }

  const run = <T>(query: Query<T>): Promise<Result<T, InfraError>> => {
    roundTrips.push([query.name])
    return answer(query)
  }

  const inTransaction: Executor = {
    batch: (queries) => {
      for (const query of queries) {
        roundTrips.push([query.name])
      }
      return answerAll(queries, (failed) => failed.name, true)
    },
    run,
  }

  const fake: FakeDb = {
    batch: (queries) => {
      roundTrips.push(queries.map((query) => query.name))
      return answerAll(queries, () => batchOp(queries), false)
    },
    calls,
    on: (def, impl) => {
      impls.set(def, impl as Impl)
      return fake
    },
    roundTrips,
    run,
    transaction: async (work) => {
      try {
        const outcome = await work(inTransaction)
        transactions.push(outcome.isOk() ? 'commit' : 'rollback')
        return outcome
      } catch (error) {
        transactions.push('rollback')
        throw error
      }
    },
    transactions,
  }
  return fake
}
