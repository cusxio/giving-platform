import { notFound } from '@tanstack/react-router'

import type { Deps } from '#/server/deps.server'
import type { RequestContext } from '#/server/request-context.server'

import { insightsSummary, weeklyCumulativeTotalsByYear } from './analytics.repository.server'
import type { Insights } from './insights'
import { summarizeInsights } from './insights'

type Ctx = Pick<RequestContext, 'deps' | 'user'>

async function loadInsights(deps: Pick<Deps, 'db'>): Promise<Insights> {
  const [summary, weekly] = await deps.db.batch([insightsSummary(), weeklyCumulativeTotalsByYear()])
  return summarizeInsights(summary, weekly)
}

// Transport adapters. Phase 2 replaces the role guard with `requireRole('su')` middleware.

export async function getInsightsProcedure(context: Ctx): Promise<Insights> {
  if (context.user?.role !== 'su') {
    throw notFound()
  }
  return loadInsights(context.deps)
}
