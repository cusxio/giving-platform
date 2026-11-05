import type { Db, Executor, Query, QueryDef } from '#/server/db.server'

interface QueryCall {
  readonly args: readonly unknown[]
  readonly name: string
}

export interface FakeDb extends Db {
  /**
   * Answers every run of `def` with `impl`. A query with no answer rejects with
   * `unexpected query <name>`. `NoInfer` fixes the row type from `def`, so an impl cannot widen it.
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
}

type Impl = (...args: readonly unknown[]) => unknown

export function createFakeDb(): FakeDb {
  const impls = new Map<QueryDef<never, unknown>, Impl>()
  const calls: QueryCall[] = []
  const roundTrips: string[][] = []

  const answer = <T>(query: Query<T>): Promise<T> => {
    calls.push({ args: query.args, name: query.name })
    const impl = impls.get(query.def)
    if (impl === undefined) {
      return Promise.reject(new Error(`unexpected query ${query.name}`))
    }
    // An impl that throws should reject like a failed statement, not throw synchronously.
    return Promise.resolve().then(() => impl(...query.args) as T)
  }

  const answerAll = async (queries: readonly Query<unknown>[]) => {
    const results: unknown[] = []
    for (const query of queries) {
      // oxlint-disable-next-line no-await-in-loop -- calls must record in statement order
      results.push(await answer(query))
    }
    return results as never
  }

  const run = <T>(query: Query<T>): Promise<T> => {
    roundTrips.push([query.name])
    return answer(query)
  }

  const inTransaction: Executor = {
    batch: (queries) => {
      for (const query of queries) {
        roundTrips.push([query.name])
      }
      return answerAll(queries)
    },
    run,
  }

  const fake: FakeDb = {
    batch: (queries) => {
      roundTrips.push(queries.map((query) => query.name))
      return answerAll(queries)
    },
    calls,
    on: (def, impl) => {
      impls.set(def, impl as Impl)
      return fake
    },
    roundTrips,
    run,
    transaction: (work) => work(inTransaction),
  }
  return fake
}
