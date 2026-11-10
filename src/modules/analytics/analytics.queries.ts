import { queryOptions } from '@tanstack/react-query'

import { getInsights, getReports } from './analytics.functions'

export function insightsQuery() {
  return queryOptions({ queryFn: () => getInsights(), queryKey: ['insights'] })
}

export function reportsQuery(startDateUTC?: Date, endDateUTCExclusive?: Date) {
  return queryOptions({
    queryFn: () => {
      if (startDateUTC && endDateUTCExclusive) {
        return getReports({ data: { endDateUTCExclusive, startDateUTC } })
      }
      return []
    },
    queryKey: ['reports', { endDateUTCExclusive, startDateUTC }],
  })
}
