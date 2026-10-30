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
}

type Impl = (...args: readonly unknown[]) => unknown

export function createFakeDb(): FakeDb {
  const impls = new Map<QueryDef<never, unknown>, Impl>()
  const calls: QueryCall[] = []

  const run = <T>(query: Query<T>): Promise<T> => {
    calls.push({ args: query.args, name: query.name })
    const impl = impls.get(query.def)
    if (impl === undefined) {
      return Promise.reject(new Error(`unexpected query ${query.name}`))
    }
    // An impl that throws should reject like a failed statement, not throw synchronously.
    return Promise.resolve().then(() => impl(...query.args) as T)
  }

  const executor: Executor = {
    batch: async (queries) => {
      const results: unknown[] = []
      for (const query of queries) {
        // oxlint-disable-next-line no-await-in-loop -- calls must record in statement order
        results.push(await run(query))
      }
      return results as never
    },
    run,
  }

  const fake: FakeDb = {
    ...executor,
    calls,
    on: (def, impl) => {
      impls.set(def, impl as Impl)
      return fake
    },
    transaction: (work) => work(executor),
  }
  return fake
}
