import { queryOptions } from '@tanstack/react-query'

import { getReportsData } from './-data/reports.get-data.procedure'

export function createReportsQueryOptions(startDateUTC?: Date, endDateUTCExclusive?: Date) {
  return queryOptions({
    queryFn: () => {
      if (startDateUTC && endDateUTCExclusive) {
        return getReportsData({ data: { endDateUTCExclusive, startDateUTC } })
      }
      return []
    },
    queryKey: ['reports', { endDateUTCExclusive, startDateUTC }],
  })
}
