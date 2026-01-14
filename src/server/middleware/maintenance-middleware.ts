import { redirect } from '@tanstack/react-router'
import { createMiddleware } from '@tanstack/react-start'

export const maintenanceMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    if (process.env.MAINTENANCE_MODE !== 'true') {
      return next()
    }

    const { pathname } = new URL(request.url)

    // Allow index page
    if (pathname === '/') {
      return next()
    }

    // Return 503 for API routes
    if (pathname.startsWith('/api/')) {
      return Response.json(
        { message: 'Service temporarily unavailable' },
        { status: 503 },
      )
    }

    // Redirect all other routes to index
    throw redirect({ to: '/', replace: true })
  },
)
