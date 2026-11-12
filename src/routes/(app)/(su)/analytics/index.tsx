import { createFileRoute } from '@tanstack/react-router'

import { Error } from '#/components/error'
import { useSuspenseQueryDeferred } from '#/hooks/use-suspense-query-deferred'
import { everyYearQuery } from '#/modules/analytics'

import { EveryYearKpis } from './-components/every-year-kpis'
import { charts } from './-components/load-charts'
import { PacePanel } from './-components/pace-panel'
import { YearsTable } from './-components/years-table'

export const Route = createFileRoute('/(app)/(su)/analytics/')({
  component: RouteComponent,
  errorComponent: Error,

  async loader({ context }) {
    await Promise.all([
      context.queryClient.query({ ...everyYearQuery(), staleTime: 'static' }),
      charts.load(),
    ])
  },
})

function RouteComponent() {
  const { data } = useSuspenseQueryDeferred(everyYearQuery())

  return (
    <>
      <p className="text-sm text-fg-muted">
        {`All donors, every year since ${data.firstYear}. Pick Period to look at a date range.`}
      </p>

      <EveryYearKpis everyYear={data} />

      {data.years.length === 0 ? (
        <p className="border border-border px-4 py-8 text-center text-sm text-fg-muted">
          No gifts yet.
        </p>
      ) : (
        <>
          <PacePanel everyYear={data} />
          <YearsTable everyYear={data} />
        </>
      )}

      <p className="text-xs text-fg-subtle">
        Every number is an aggregate. No donor is named on this page.
      </p>
    </>
  )
}
