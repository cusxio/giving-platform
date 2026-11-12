import { createServerFn } from '@tanstack/react-start'

import { wireInput } from '#/core/wire'

import type { AnalyticsInput } from './analytics.server'
import { getAnalyticsAction } from './analytics.server'

export const getAnalytics = createServerFn()
  .validator(wireInput<AnalyticsInput>())
  .handler((ctx) => getAnalyticsAction(ctx))
