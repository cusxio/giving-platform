import { SidebarSimpleIcon } from '@phosphor-icons/react/dist/ssr'

import { Button } from '#/components/ui/button'
import { cx } from '#/styles/cx'

import { useAsideNavStore } from './use-aside-nav-store'

export function AsideNavButton() {
  const toggle = useAsideNavStore((state) => state.toggle)

  return (
    <Button
      className={cx(
        'h-10 w-10',
        'text-fg-subtle',
        'transition-colors',
        'hover:text-fg-default',
      )}
      onClick={() => {
        toggle()
      }}
    >
      <SidebarSimpleIcon size={20} />
    </Button>
  )
}
