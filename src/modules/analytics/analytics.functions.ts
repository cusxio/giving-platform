import { createServerFn } from '@tanstack/react-start'

import { wireInput } from '#/core/wire'

import type { ReportsInput } from './analytics.server'
import { getInsightsAction, getReportsAction } from './analytics.server'

export const getInsights = createServerFn()
  .validator(wireInput<undefined>())
  .handler((ctx) => getInsightsAction(ctx))

export const getReports = createServerFn()
  .validator(wireInput<ReportsInput>())
  .handler((ctx) => getReportsAction(ctx))
