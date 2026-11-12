import { Link, Outlet, createFileRoute } from '@tanstack/react-router'

import { config } from '#/core/brand'
import { cx } from '#/styles/cx'

export const Route = createFileRoute('/(app)/(su)/analytics')({
  component: RouteComponent,
  head: () => ({ meta: [{ title: `Analytics · ${config.entity}` }] }),
})

const TAB = cx(
  'flex h-8 items-center px-3 text-sm text-fg-muted transition-colors hover:text-fg-default',
  'data-[status=active]:bg-elevated data-[status=active]:text-fg-default',
)

function RouteComponent() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl text-fg-1">Analytics</h1>
        <nav aria-label="Analytics views" className="flex border border-border bg-base-0/50 p-0.5">
          <Link
            activeOptions={{ exact: true, includeSearch: false }}
            className={TAB}
            to="/analytics"
          >
            Every year
          </Link>
          <Link
            activeOptions={{ includeSearch: false }}
            className={TAB}
            search={{ end: undefined, start: undefined }}
            to="/analytics/period"
          >
            Period
          </Link>
        </nav>
      </header>
      <Outlet />
    </div>
  )
}
