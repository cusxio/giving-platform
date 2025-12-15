import { useState } from 'react'

interface FreezeUIProps {
  children: string | string[]
}

/**
 * Renders its children only once, on the initial mount.
 * It ignores all subsequent prop updates.
 *
 * WARNING: This component is only safe to use inside parent components
 * that are guaranteed to unmount and remount to "refresh" the content.
 * Ideal for menu items, popovers, or modals. Do not use on persistent UI.
 */
export function FreezeUI(props: FreezeUIProps) {
  // eslint-disable-next-line @eslint-react/naming-convention/use-state
  const [children] = useState(props.children)
  return <>{children}</>
}
