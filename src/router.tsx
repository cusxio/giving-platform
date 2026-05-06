import { QueryClient } from '@tanstack/react-query'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'

import { NotFound } from './components/not-found'
import { routeTree } from './route-tree.gen'

export function getRouter() {
  const queryClient = new QueryClient()

  const router = createTanStackRouter({
    context: { queryClient },
    defaultNotFoundComponent: NotFound,
    defaultPreload: 'intent',
    routeTree,
    scrollRestoration: true,
  })

  setupRouterSsrQueryIntegration({ queryClient, router })

  return router
}
