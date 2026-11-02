import type { AnyColumn } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

export function roundedAvg(column: AnyColumn) {
  return sql<number>`ROUND(AVG(${column}), 2)::float`
}

export function safeSum(column: AnyColumn) {
  return sql<number>`COALESCE(SUM(${column}), 0)::integer`
}

/** Drizzle keeps a varchar's declared length in the column type's third parameter. */
type ColumnLength<Column> =
  Column extends PgColumn<infer _Data, infer _Runtime, { length: infer L }> ? L : never

/** Whether a varchar column was declared `Length` characters long, for tsc to pin a limit to it. */
export type SameLength<Length extends number, Column> = [Length] extends [ColumnLength<Column>]
  ? [ColumnLength<Column>] extends [Length]
    ? true
    : false
  : false
