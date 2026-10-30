import { centsToRinggit } from '#/core/money'
import type { QueryResult } from '#/server/db.server'

import type { fundTotals } from './analytics.repository.server'

export type ReportRow = ReturnType<typeof toReportRows>[number]

export function toReportRows(rows: QueryResult<typeof fundTotals>) {
  return rows.map((row) => ({
    createdAs: row.createdAs,
    fundName: row.fundName,
    totalAmount: centsToRinggit(row.totalAmount),
  }))
}
