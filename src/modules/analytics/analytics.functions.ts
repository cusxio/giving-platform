import { createServerFn } from '@tanstack/react-start'

import { wireInput } from '#/core/wire'

import type { AnalyticsInput } from './analytics.server'
import { getAnalyticsAction } from './analytics.server'
import { getEveryYearAction } from './every-year.server'

export const getAnalytics = createServerFn()
  .validator(wireInput<AnalyticsInput>())
  .handler((ctx) => getAnalyticsAction(ctx))

export const getEveryYear = createServerFn()
  .validator(wireInput<undefined>())
  .handler((ctx) => getEveryYearAction(ctx))
