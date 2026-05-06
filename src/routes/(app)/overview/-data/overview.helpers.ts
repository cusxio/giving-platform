import { TZDate, addYears, clientTz, serverTz, startOfYear } from '#/core/date'

export function getYearDateRange(year: 'all' | number) {
  if (year === 'all') {
    return { endDateUTCExclusive: undefined, startDateUTC: undefined }
  }

  const referenceDate = new TZDate(year, 0, 1, clientTz)
  const startDate = startOfYear(referenceDate)
  const endDate = startOfYear(addYears<TZDate>(startDate, 1))

  return {
    endDateUTCExclusive: new Date(endDate.withTimeZone(serverTz)),
    startDateUTC: new Date(startDate.withTimeZone(serverTz)),
  }
}
