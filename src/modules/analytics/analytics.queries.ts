import { queryOptions } from '@tanstack/react-query'

import { getAnalytics, getEveryYear } from './analytics.functions'
import type { AnalyticsInput } from './analytics.server'

export function analyticsQuery(search: AnalyticsInput) {
  return queryOptions({
    queryFn: () => getAnalytics({ data: search }),
    queryKey: ['analytics', { end: search.end, start: search.start }],
  })
}

export function everyYearQuery() {
  return queryOptions({ queryFn: () => getEveryYear(), queryKey: ['analytics', 'every-year'] })
}
