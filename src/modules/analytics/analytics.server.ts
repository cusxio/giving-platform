import { Type } from 'typebox'
import { Compile } from 'typebox/compile'

import { now } from '#/core/date'
import { countStalePending } from '#/modules/payments/server'
import { requireSu } from '#/server/authorize.server'
import type { Deps } from '#/server/deps.server'
import type { Parsed } from '#/server/input.server'
import { parseWith } from '#/server/input.server'
import { defineRead } from '#/server/procedure.server'

import { paceRange, toAnalytics } from './analytics'
import {
  countHeld,
  donorWindows,
  fundTotals,
  giftSizeBands,
  givingHeatmap,
  monthlyByFund,
  paymentMethodOutcomes,
  periodTotals,
  weeklyCumulativeTotalsByYear,
} from './analytics.repository.server'
import { GIFT_BAND_BOUNDS } from './gift-bands'
import { isIsoDate, isoDateOf, resolvePeriod, spanOf, windowsOf } from './period'

const isoDate = Type.Refine(Type.String({ maxLength: 10 }), isIsoDate, () => 'must be a date')
const analyticsInput = parseWith(
  Compile(Type.Object({ end: Type.Optional(isoDate), start: Type.Optional(isoDate) })),
)
export type AnalyticsInput = Parsed<typeof analyticsInput>

/** Reads the whole page in one round trip. `today` is the Kuala Lumpur day it runs on. */
export async function loadAnalytics(deps: Pick<Deps, 'db'>, input: AnalyticsInput, today: string) {
  const period = resolvePeriod(input, today)
  const windows = windowsOf(period)
  const read = await deps.db.batch([
    periodTotals(windows.period),
    periodTotals(windows.compare),
    monthlyByFund(windows.period),
    monthlyByFund(windows.compare),
    donorWindows(windows),
    fundTotals(windows.period),
    fundTotals(windows.compare),
    weeklyCumulativeTotalsByYear(spanOf(paceRange(period.period))),
    giftSizeBands(windows.period, GIFT_BAND_BOUNDS),
    giftSizeBands(windows.compare, GIFT_BAND_BOUNDS),
    givingHeatmap(windows.period),
    paymentMethodOutcomes(windows.period),
    countHeld(),
    countStalePending(),
  ])
  return read.map(
    ([
      totals,
      compareTotals,
      monthly,
      compareMonthly,
      donors,
      funds,
      compareFunds,
      pace,
      bands,
      compareBands,
      heatmap,
      payments,
      held,
      stalePending,
    ]) =>
      toAnalytics(period, windows, {
        bands,
        compareBands,
        compareFunds,
        compareMonthly,
        compareTotals,
        donors,
        funds,
        held,
        heatmap,
        monthly,
        pace,
        payments,
        stalePending,
        totals,
      }),
  )
}

export const getAnalyticsAction = defineRead({
  auth: requireSu,
  event: 'analytics.read',
  input: analyticsInput,
  run: ({ deps }, input) => loadAnalytics(deps, input, isoDateOf(now())),
  wire: {},
})
