import { preloadable } from '#/components/ui/chart/preloadable'

/**
 * TanStack splits only a route's components out of the route file, so the overview loader that
 * calls this ships in the router's entry chunk, and so would anything this file imported.
 */
export const charts = preloadable(() => import('./index'))
