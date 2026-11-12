import { createFileRoute, redirect } from '@tanstack/react-router'

import { periodSearch } from './-period-search'

/** Reports folded into the Analytics funds table. Its old date keys carry over. */
export const Route = createFileRoute('/(app)/(su)/reports')({
  validateSearch: (search) => periodSearch(search.start_date, search.end_date),

  beforeLoad({ search }) {
    throw redirect({ search, to: '/analytics' })
  },
})
