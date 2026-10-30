import { notFound } from '@tanstack/react-router'

import type { Deps } from '#/server/deps.server'
import type { RequestContext } from '#/server/request-context.server'

import type { Donor } from './history.repository.server'
import {
  recentTransactions,
  successFundItems,
  successTimeline,
  successYears,
} from './history.repository.server'
import type { Overview, OverviewYear } from './overview'
import { scopeFor, summarizeOverview } from './overview'

type Ctx = Pick<RequestContext, 'deps' | 'user'>

export interface OverviewInput {
  readonly journey: Donor['journey']
  readonly year: OverviewYear
}

export interface AvailableYearsInput {
  readonly journey: Donor['journey']
}

/** One neon-http round trip for the three reads, then pure aggregation. */
async function loadOverview(
  deps: Pick<Deps, 'db'>,
  input: { readonly donor: Donor; readonly year: OverviewYear },
): Promise<Overview> {
  const scope = scopeFor(input.donor, input.year)
  const [recent, timeline, fundItems] = await deps.db.batch([
    recentTransactions(scope),
    successTimeline(scope),
    successFundItems(scope),
  ])
  return summarizeOverview(recent, timeline, fundItems)
}

function loadAvailableYears(deps: Pick<Deps, 'db'>, donor: Donor): Promise<number[]> {
  return deps.db.run(successYears(donor))
}

// Transport adapters. Phase 2 replaces the null-user guard with `requireUser` middleware.

export async function getOverviewProcedure(context: Ctx, data: OverviewInput): Promise<Overview> {
  if (!context.user) {
    throw notFound()
  }
  return loadOverview(context.deps, {
    donor: { id: context.user.id, journey: data.journey },
    year: data.year,
  })
}

export async function getAvailableYearsProcedure(
  context: Ctx,
  data: AvailableYearsInput,
): Promise<number[]> {
  if (!context.user) {
    throw notFound()
  }
  return loadAvailableYears(context.deps, { id: context.user.id, journey: data.journey })
}
