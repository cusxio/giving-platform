import { createFileRoute, notFound, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/(app)/(su)')({
  beforeLoad({ context }) {
    if (context.user.role !== 'su') {
      throw notFound()
    }
  },
  component: RouteComponent,
})

function RouteComponent() {
  return <Outlet />
}
