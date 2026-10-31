import { notFound } from '@tanstack/react-router'

import type { Deps } from '#/server/deps.server'
import type { RequestContext } from '#/server/request-context.server'

import {
  fundTotals,
  insightsSummary,
  weeklyCumulativeTotalsByYear,
} from './analytics.repository.server'
import type { Insights } from './insights'
import { summarizeInsights } from './insights'
import { toReportRows } from './reports'

type Ctx = Pick<RequestContext, 'deps' | 'user'>

export interface ReportsInput {
  readonly endDateUTCExclusive: Date
  readonly startDateUTC: Date
}

export async function loadInsights(deps: Pick<Deps, 'db'>): Promise<Insights> {
  const [summary, weekly] = await deps.db.batch([insightsSummary(), weeklyCumulativeTotalsByYear()])
  return summarizeInsights(summary, weekly)
}

export async function loadReport(
  deps: Pick<Deps, 'db'>,
  input: { readonly endExclusive: Date; readonly start: Date },
) {
  return toReportRows(await deps.db.run(fundTotals(input)))
}

// Transport adapters. Phase 2 replaces the role guard with `requireRole('su')` middleware.

export async function getInsightsProcedure(context: Ctx): Promise<Insights> {
  if (context.user?.role !== 'su') {
    throw notFound()
  }
  return loadInsights(context.deps)
}

export async function getReportsProcedure(context: Ctx, data: ReportsInput) {
  const { startDateUTC, endDateUTCExclusive } = data
  if (context.user?.role !== 'su') {
    throw notFound()
  }
  return loadReport(context.deps, { endExclusive: endDateUTCExclusive, start: startDateUTC })
}
