import { addYears, clientTz, serverTz, startOfYear, TZDate } from '#/core/date'

export function getYearDateRange(year: 'all' | number) {
  if (year === 'all') {
    return { startDateUTC: undefined, endDateUTCExclusive: undefined }
  }

  const referenceDate = new TZDate(year, 0, 1, clientTz)
  const startDate = startOfYear(referenceDate)
  const endDate = startOfYear(addYears<TZDate>(startDate, 1))

  return {
    startDateUTC: new Date(startDate.withTimeZone(serverTz)),
    endDateUTCExclusive: new Date(endDate.withTimeZone(serverTz)),
  }
}
