import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/(app)/(su)/insights')({
  beforeLoad() {
    throw redirect({ to: '/analytics' })
  },
})
