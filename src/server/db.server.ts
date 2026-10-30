import type { BatchItem } from 'drizzle-orm/batch'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'

import type { DB, DBPool, DBPoolTransaction } from '#/server/neon.server'

/**
 * The drizzle handle a statement is built against: neon-http for run and batch, a pool
 * transaction inside `transaction`. Typed as their common base because drizzle's builder
 * overloads do not resolve on a union of the two.
 */
export type Sql = PgDatabase<PgQueryResultHKT>

type Assert<T extends true> = T
type IsAny<T> = 0 extends 1 & T ? true : false

// If `Sql` or a handle degraded to `any`, the assignability check below would pass vacuously.
type SqlHandlesFit = Assert<
  [IsAny<Sql>, IsAny<DB>, IsAny<DBPoolTransaction>] extends [false, false, false]
    ? [DB, DBPoolTransaction] extends [Sql, Sql]
      ? true
      : false
    : false
>

/** @public Fails typecheck when a driver upgrade makes a handle stop fitting `Sql`. */
export const sqlHandlesFit: SqlHandlesFit = true

/** A drizzle builder: batchable, awaitable for its raw result, and renderable for SQL checks. */
type Statement<R> = BatchItem<'pg'> &
  PromiseLike<R> & { toSQL: () => { params: unknown[]; sql: string } }

/**
 * A described statement plus its decoder. Nothing runs until an executor runs it, so one query
 * works awaited alone, inside an atomic neon-http batch, or inside a pool transaction.
 */
export interface Query<T> {
  /** Stable dotted name, such as `users.findByEmail`, for logs and fakes. */
  readonly name: string
  readonly args: readonly unknown[]
  /** The factory that made this query. Fakes dispatch on it. */
  readonly def: QueryDef<never, T>
  readonly build: (sql: Sql) => Statement<unknown>
  readonly decode: (raw: unknown) => T
}

export interface QueryDef<A extends readonly unknown[], T> {
  (...args: A): Query<T>
  readonly queryName: string
}

/** The decoded type a query factory yields. */
export type QueryResult<D> = D extends QueryDef<never, infer T> ? T : never

/** The one way to write SQL. `build` receives the handle first, then the caller's arguments. */
export function defineQuery<A extends unknown[], R, T>(
  name: string,
  build: (sql: Sql, ...args: A) => Statement<R>,
  decode: (raw: R) => T,
): QueryDef<A, T> {
  const def: QueryDef<A, T> = Object.assign(
    (...args: A): Query<T> => ({
      args,
      build: (sql: Sql) => build(sql, ...args),
      decode: (raw: unknown) => decode(raw as R),
      def,
      name,
    }),
    { queryName: name },
  )
  return def
}

export const rows = <R>(raw: R): R => raw

export const firstOrNull = <R>(raw: readonly R[]): R | null => raw[0] ?? null

/** For statements that always return a row, such as `insert ... returning`. */
export function first<R>(raw: readonly R[]): R {
  const [row] = raw
  if (row === undefined) {
    throw new Error('Expected the statement to return a row, but it returned none')
  }
  return row
}

export const nothing = (): undefined => undefined

type Results<Q extends readonly Query<unknown>[]> = {
  -readonly [K in keyof Q]: Q[K] extends Query<infer T> ? T : never
}

/** Runs queries. Inside a transaction `batch` runs them in order; outside it is one atomic neon-http batch. */
export interface Executor {
  readonly run: <T>(query: Query<T>) => Promise<T>
  readonly batch: <const Q extends readonly [Query<unknown>, ...Query<unknown>[]]>(
    queries: Q,
  ) => Promise<Results<Q>>
}

export interface Db extends Executor {
  /** Interactive transaction on the websocket pool. Throwing inside `work` rolls back. */
  readonly transaction: <T>(work: (tx: Executor) => Promise<T>) => Promise<T>
}

async function runOn<T>(sql: Sql, query: Query<T>): Promise<T> {
  return query.decode(await query.build(sql))
}

function sequentialExecutor(sql: Sql): Executor {
  return {
    batch: async <const Q extends readonly [Query<unknown>, ...Query<unknown>[]]>(queries: Q) => {
      const results: unknown[] = []
      for (const query of queries) {
        // oxlint-disable-next-line no-await-in-loop -- statements share one transaction connection
        results.push(await runOn(sql, query))
      }
      return results as Results<Q>
    },
    run: (query) => runOn(sql, query),
  }
}

/** Wraps the two neon clients. Only the composition root calls it. */
export function createDb(http: DB, pool: DBPool): Db {
  return {
    batch: async <const Q extends readonly [Query<unknown>, ...Query<unknown>[]]>(queries: Q) => {
      const [head, ...tail] = queries
      const raw: readonly unknown[] = await http.batch([
        head.build(http),
        ...tail.map((query) => query.build(http)),
      ])
      return queries.map((query, index) => query.decode(raw[index])) as Results<Q>
    },
    run: (query) => runOn(http, query),
    transaction: (work) => pool.transaction((tx) => work(sequentialExecutor(tx))),
  }
}
