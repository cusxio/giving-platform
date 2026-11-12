import { createFileRoute, redirect } from '@tanstack/react-router'

import { periodSearch } from './-period-search'

/** Insights became Analytics. */
export const Route = createFileRoute('/(app)/(su)/insights')({
  validateSearch: (search) => periodSearch(search.start, search.end),

  beforeLoad({ search }) {
    throw redirect({ search, to: '/analytics' })
  },
})
