import { queryOptions } from '@tanstack/react-query'

import { getInsights } from './analytics.functions'

export function insightsQuery() {
  return queryOptions({ queryFn: () => getInsights(), queryKey: ['insights'] })
}
