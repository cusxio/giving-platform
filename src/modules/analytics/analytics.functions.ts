import { createServerFn } from '@tanstack/react-start'

import { getInsightsProcedure } from './analytics.server'

export const getInsights = createServerFn().handler(({ context }) => getInsightsProcedure(context))
