import type { AnyColumn } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

export function roundedAvg(column: AnyColumn) {
  return sql<number>`round(avg(${column}), 2)`
}

export function safeSum(column: AnyColumn) {
  return sql<number>`coalesce(sum(${column}), 0)`
}
