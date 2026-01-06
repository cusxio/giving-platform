import type { AnyColumn } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

export function roundedAvg(column: AnyColumn) {
  return sql<number>`ROUND(AVG(${column})::numeric, 2)`
}

export function safeSum(column: AnyColumn) {
  return sql<number>`COALESCE(SUM(${column}), 0)`
}
