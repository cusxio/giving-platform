import { queryOptions } from '@tanstack/react-query'

import { getInsightsData } from './-data/insights.get-data.procedure'

export function createInsightsQueryOptions() {
  return queryOptions({ queryFn: () => getInsightsData(), queryKey: ['insights'] })
}
