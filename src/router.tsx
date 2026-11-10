import { QueryClient } from '@tanstack/react-query'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { createIsomorphicFn } from '@tanstack/react-start'

import { NotFound } from './components/not-found'
import { routeTree } from './route-tree.gen'

const serverMaintenanceMode = createIsomorphicFn()
  .server(() => process.env.MAINTENANCE_MODE === 'true')
  .client(() => false)

export function getRouter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } })
  const context = { isMaintenanceMode: serverMaintenanceMode(), queryClient }

  const router = createTanStackRouter({
    context,
    defaultNotFoundComponent: NotFound,
    defaultPreload: 'intent',
    dehydrate: () => ({ isMaintenanceMode: context.isMaintenanceMode }),
    hydrate: (dehydrated) => {
      context.isMaintenanceMode = dehydrated.isMaintenanceMode
    },
    routeTree,
    scrollRestoration: true,
  })

  setupRouterSsrQueryIntegration({ queryClient, router })

  return router
}
