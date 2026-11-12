import { preloadable } from '#/components/ui/chart/preloadable'

/**
 * Not in route.tsx: TanStack copies a binding that both the loader and the component use into
 * each of their chunks, and the two must share one loaded module.
 */
export const charts = preloadable(() => import('./charts'))
