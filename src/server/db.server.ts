import { Result } from 'better-result'
import type { SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'

import type { DB, DBPool, DBPoolTransaction } from '#/server/db-connection.server'
import { InfraError, infra } from '#/server/infra-error'

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

/**
 * A statement written as SQL. drizzle's `insert().select()` lists every insertable column, in
 * table order (`pg-core/dialect.js`, `buildInsertQuery`), so an insert that selects its rows
 * cannot leave a serial id to its default; such a statement is written here instead. It runs and
 * batches like a built one, and the driver answers its RETURNING as `rows`.
 */
export function rawStatement(sql: Sql, text: SQL): Statement<{ rows: Record<string, unknown>[] }> {
  const statement = sql.execute(text)
  return Object.assign(statement, { toSQL: () => statement.getQuery() }) as Statement<{
    rows: Record<string, unknown>[]
  }>
}

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

export const nothing = (): undefined => undefined

/** The decoded results of a batch, one per query, in order. */
export type Results<Q extends readonly Query<unknown>[]> = {
  -readonly [K in keyof Q]: Q[K] extends Query<infer T> ? T : never
}

/**
 * Runs queries. A driver or decoder failure is `Err(InfraError)`, never a throw. Inside a
 * transaction `batch` runs the statements in order; outside it is one atomic neon-http batch.
 */
export interface Executor {
  readonly run: <T>(query: Query<T>) => Promise<Result<T, InfraError>>
  readonly batch: <const Q extends readonly [Query<unknown>, ...Query<unknown>[]]>(
    queries: Q,
  ) => Promise<Result<Results<Q>, InfraError>>
}

export interface Db extends Executor {
  /**
   * Interactive transaction on the websocket pool. `Ok` from `work` commits. `Err` rolls back
   * and is returned as it is. A throw from `work` is a defect: it rolls back and propagates
   * untouched. A failed begin, commit or rollback is `Err(InfraError{ op: 'db.transaction' })`.
   */
  readonly transaction: <T, E>(
    work: (tx: Executor) => Promise<Result<T, E>>,
  ) => Promise<Result<T, E | InfraError>>
}

/** The `op` of a neon-http batch, which fails as one statement. */
export const batchOp = (queries: readonly Query<unknown>[]): string =>
  queries.map((query) => query.name).join(' + ')

function attempt<T>(op: string, execute: () => Promise<T>): Promise<Result<T, InfraError>> {
  return Result.tryPromise({ catch: (cause) => infra(op, cause), try: execute })
}

function runOn<T>(sql: Sql, query: Query<T>): Promise<Result<T, InfraError>> {
  return attempt(query.name, async () => query.decode(await query.build(sql)))
}

function sequentialExecutor(sql: Sql): Executor {
  return {
    batch: async <const Q extends readonly [Query<unknown>, ...Query<unknown>[]]>(queries: Q) => {
      const results: unknown[] = []
      for (const query of queries) {
        // oxlint-disable-next-line no-await-in-loop -- statements share one transaction connection
        const result = await runOn(sql, query)
        if (result.isErr()) {
          return Result.err(result.error)
        }
        results.push(result.value)
      }
      return Result.ok(results as Results<Q>)
    },
    run: (query) => runOn(sql, query),
  }
}

/** Thrown for an `Err`, because the pool rolls back only when its callback throws. */
const ROLLBACK = new Error('transaction work returned Err')

async function transact<T, E>(
  pool: DBPool,
  work: (tx: Executor) => Promise<Result<T, E>>,
): Promise<Result<T, E | InfraError>> {
  let outcome: Result<T, E> | undefined
  let threw: { readonly error: unknown } | undefined
  try {
    return await pool.transaction(async (tx) => {
      try {
        outcome = await work(sequentialExecutor(tx))
      } catch (error) {
        threw = { error }
        throw error
      }
      if (outcome.isErr()) {
        throw ROLLBACK
      }
      return outcome
    })
  } catch (error) {
    if (threw !== undefined) {
      // oxlint-disable-next-line typescript/only-throw-error -- the work's own throw, unchanged, even when the rollback after it failed
      throw threw.error
    }
    if (error === ROLLBACK && outcome !== undefined) {
      return outcome
    }
    return Result.err(
      new InfraError({
        cause: error,
        message: 'db.transaction failed',
        op: 'db.transaction',
        reason: 'failed',
        rejected: outcome !== undefined && outcome.isErr() ? outcome.error : undefined,
      }),
    )
  }
}

/** Wraps the two neon clients. Only the composition root calls it. */
export function createDb(http: DB, pool: DBPool): Db {
  return {
    batch: <const Q extends readonly [Query<unknown>, ...Query<unknown>[]]>(queries: Q) =>
      attempt(batchOp(queries), async () => {
        const [head, ...tail] = queries
        const raw: readonly unknown[] = await http.batch([
          head.build(http),
          ...tail.map((query) => query.build(http)),
        ])
        return queries.map((query, index) => query.decode(raw[index])) as Results<Q>
      }),
    run: (query) => runOn(http, query),
    transaction: (work) => transact(pool, work),
  }
}
