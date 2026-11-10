import { redirect } from '@tanstack/react-router'
import { createMiddleware } from '@tanstack/react-start'

export const maintenanceMiddleware = createMiddleware().server(async ({ next, request }) => {
  if (process.env.MAINTENANCE_MODE !== 'true') {
    return next()
  }

  const { pathname } = new URL(request.url)

  if (pathname === '/') {
    return next()
  }

  if (pathname.startsWith('/api/')) {
    return Response.json({ message: 'Service temporarily unavailable' }, { status: 503 })
  }

  throw redirect({ reloadDocument: true, replace: true, to: '/' })
})
