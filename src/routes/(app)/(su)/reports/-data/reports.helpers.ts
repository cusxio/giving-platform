import { addDays, clientTz, serverTz, startOfDay, TZDate } from '#/core/date'

export function normalizeDateRangeToServerTimezone(
  start_date?: string,
  end_date?: string,
) {
  const startDate =
    start_date === undefined
      ? undefined
      : new Date(
          startOfDay(new TZDate(start_date, clientTz)).withTimeZone(serverTz),
        )
  const endDate =
    end_date === undefined
      ? undefined
      : new Date(
          addDays(
            startOfDay(new TZDate(end_date, clientTz)).withTimeZone(serverTz),
            1,
          ),
        )

  return { startDate, endDate }
}
