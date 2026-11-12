import { createFileRoute, redirect } from '@tanstack/react-router'

import { periodSearch } from './-period-search'

export const Route = createFileRoute('/(app)/(su)/reports')({
  validateSearch: (search) => periodSearch(search.start_date, search.end_date),

  beforeLoad({ search }) {
    throw redirect({ search: { end: search.end, start: search.start }, to: '/analytics/period' })
  },
})
