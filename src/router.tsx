import { QueryClient } from '@tanstack/react-query'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'

import { NotFound } from './components/not-found'
import { routeTree } from './route-tree.gen'

export function getRouter() {
  const queryClient = new QueryClient()

  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultNotFoundComponent: NotFound,
    context: { queryClient },
    defaultPreload: 'intent',
  })

  setupRouterSsrQueryIntegration({ router, queryClient })

  return router
}
