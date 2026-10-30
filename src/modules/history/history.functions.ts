import { createServerFn } from '@tanstack/react-start'

import type { AvailableYearsInput, OverviewInput } from './history.server'
import { getAvailableYearsProcedure, getOverviewProcedure } from './history.server'

export const getOverview = createServerFn()
  .validator((input: OverviewInput) => input)
  .handler(({ context, data }) => getOverviewProcedure(context, data))

export const getAvailableYears = createServerFn()
  .validator((input: AvailableYearsInput) => input)
  .handler(({ context, data }) => getAvailableYearsProcedure(context, data))
