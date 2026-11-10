import { lazy } from 'react'
import type { ComponentType } from 'react'

/**
 * React.lazy suspends on its first render even when its import has already settled, so a route
 * whose loader awaited the code would still show the fallback. A component made here renders the
 * module directly once `load` has resolved it, and stays lazy until then.
 */
export function preloadable<M>(importModule: () => Promise<M>) {
  let loaded: M | undefined
  const load = () => importModule().then((module) => (loaded = module))

  return {
    component<P extends object>(pick: (module: M) => ComponentType<P>) {
      const Lazy = lazy(() => load().then((module) => ({ default: pick(module) })))
      return function Preloaded(props: P) {
        const Component = loaded === undefined ? Lazy : pick(loaded)
        return <Component {...props} />
      }
    },
    load,
  }
}
