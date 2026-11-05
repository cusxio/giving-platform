import type { AnyColumn } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

export function roundedAvg(column: AnyColumn) {
  return sql<number>`ROUND(AVG(${column}), 2)::float`
}

export function safeSum(column: AnyColumn) {
  return sql<number>`COALESCE(SUM(${column}), 0)::integer`
}
