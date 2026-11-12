import { now } from '#/core/date'
import { requireSu } from '#/server/authorize.server'
import type { Deps } from '#/server/deps.server'
import { noInput } from '#/server/input.server'
import { defineRead } from '#/server/procedure.server'

import { periodTotals, weeklyTotalsByYear, yearTotals } from './analytics.repository.server'
import { sameDaysLastYear, toEveryYear } from './every-year'
import { isoDateOf, spanOf } from './period'

export async function loadEveryYear(deps: Pick<Deps, 'db'>, today: string) {
  const read = await deps.db.batch([
    yearTotals(),
    periodTotals(spanOf(sameDaysLastYear(today))),
    weeklyTotalsByYear(),
  ])
  return read.map(([years, lastYear, weeks]) =>
    toEveryYear(today, { sameDaysLastYear: lastYear, weeks, years }),
  )
}

export const getEveryYearAction = defineRead({
  auth: requireSu,
  event: 'analytics.every_year',
  input: noInput,
  run: ({ deps }) => loadEveryYear(deps, isoDateOf(now())),
  wire: {},
})
