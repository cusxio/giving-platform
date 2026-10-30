import { createServerFn } from '@tanstack/react-start'

import type { ReportsInput } from './analytics.server'
import { getInsightsProcedure, getReportsProcedure } from './analytics.server'

export const getInsights = createServerFn().handler(({ context }) => getInsightsProcedure(context))

export const getReports = createServerFn()
  .validator((input: ReportsInput) => input)
  .handler(({ context, data }) => getReportsProcedure(context, data))
