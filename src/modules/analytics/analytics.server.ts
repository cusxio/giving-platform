import { Type } from 'typebox'
import { Compile } from 'typebox/compile'

import { requireSu } from '#/server/authorize.server'
import type { Deps } from '#/server/deps.server'
import type { Parsed } from '#/server/input.server'
import { noInput, parseWith } from '#/server/input.server'
import { defineRead } from '#/server/procedure.server'

import {
  fundTotals,
  insightsSummary,
  weeklyCumulativeTotalsByYear,
} from './analytics.repository.server'
import { summarizeInsights } from './insights'
import { toReportRows } from './reports'

export async function loadInsights(deps: Pick<Deps, 'db'>) {
  const read = await deps.db.batch([insightsSummary(), weeklyCumulativeTotalsByYear()])
  return read.map(([summary, weekly]) => summarizeInsights(summary, weekly))
}

export async function loadReport(
  deps: Pick<Deps, 'db'>,
  input: { readonly endExclusive: Date; readonly start: Date },
) {
  const read = await deps.db.run(fundTotals(input))
  return read.map((rows) => toReportRows(rows))
}

export const getInsightsAction = defineRead({
  auth: requireSu,
  event: 'analytics.insights',
  input: noInput,
  run: ({ deps }) => loadInsights(deps),
  wire: {},
})

const validDate = Type.Refine(
  Type.Unsafe<Date>({}),
  (value) => value instanceof Date && !Number.isNaN(value.getTime()),
  () => 'must be a valid date',
)
const reportsSchema = Compile(
  Type.Object({ endDateUTCExclusive: validDate, startDateUTC: validDate }),
)
const reportsInput = parseWith(reportsSchema)
export type ReportsInput = Parsed<typeof reportsInput>

export const getReportsAction = defineRead({
  auth: requireSu,
  event: 'analytics.reports',
  input: reportsInput,
  run: ({ deps }, { endDateUTCExclusive, startDateUTC }) =>
    loadReport(deps, { endExclusive: endDateUTCExclusive, start: startDateUTC }),
  wire: {},
})
