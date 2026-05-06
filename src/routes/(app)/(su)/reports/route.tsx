import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { TZDate } from 'react-day-picker'
import * as v from 'valibot'

import { Error } from '#/components/error'
import type { DateRangePickerProps } from '#/components/ui/date-range-picker'
import { DateRangePicker } from '#/components/ui/date-range-picker'
import { config } from '#/core/brand'
import { useSuspenseQueryDeferred } from '#/hooks'

import { ReportBreakdown } from './-components/report-breakdown'
import { ReportEmpty } from './-components/report-empty'
import { normalizeDateRangeToServerTimezone } from './-data/reports.helpers'
import { createReportsQueryOptions } from './-reports.queries'

const searchSchema = v.object({
  end_date: v.optional(v.pipe(v.string(), v.isoDate())),
  start_date: v.optional(v.pipe(v.string(), v.isoDate())),
})

export const Route = createFileRoute('/(app)/(su)/reports')({
  component: RouteComponent,

  errorComponent: Error,

  head: () => ({ meta: [{ title: `Reports · ${config.entity}` }] }),

  validateSearch(search) {
    const parseResult = v.safeParse(searchSchema, search)

    if (!parseResult.success) {
      return {}
    }

    const { start_date, end_date } = parseResult.output
    return { end_date, start_date }
  },

  loaderDeps({ search }) {
    return { end_date: search.end_date, start_date: search.start_date }
  },

  async loader({ context, deps }) {
    const { startDate, endDate } = normalizeDateRangeToServerTimezone(
      deps.start_date,
      deps.end_date,
    )

    await context.queryClient.ensureQueryData(createReportsQueryOptions(startDate, endDate))
  },
})

function RouteComponent() {
  const { end_date, start_date } = Route.useSearch()

  const [dateRange, setDateRange] = useState<DateRangePickerProps['value']>(() => ({
    from: start_date === undefined ? undefined : new TZDate(start_date),
    to: end_date === undefined ? undefined : new TZDate(end_date),
  }))

  const navigate = useNavigate()
  const handleChangeDateRange: DateRangePickerProps['onChange'] = useCallback(
    (nextValue) => {
      setDateRange(nextValue)

      const toISODateString = (date: Date) => date.toLocaleDateString('en-CA')

      const startDate = nextValue?.from ? toISODateString(nextValue.from) : undefined
      const endDate = nextValue?.to ? toISODateString(nextValue.to) : undefined

      navigate({ search: { end_date: endDate, start_date: startDate }, to: '/reports' }).catch(
        console.error,
      )
    },
    [navigate],
  )

  const { startDate, endDate } = normalizeDateRangeToServerTimezone(start_date, end_date)

  const { data } = useSuspenseQueryDeferred(createReportsQueryOptions(startDate, endDate))

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-y-4 p-4">
      <DateRangePicker onChange={handleChangeDateRange} value={dateRange} />
      {data.length > 0 ? (
        <ReportBreakdown data={data} />
      ) : (
        <ReportEmpty reason={start_date === undefined ? 'idle' : 'no-data'} />
      )}
    </div>
  )
}
