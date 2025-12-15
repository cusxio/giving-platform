import type { ReactNode } from 'react'

import { cx } from '#/styles/cx'

export function ChartTitle(props: { children: ReactNode; className?: string }) {
  return (
    <h1
      className={cx(
        'border-b border-border/80 px-4 py-3 text-fg-muted',
        props.className,
      )}
    >
      {props.children}
    </h1>
  )
}
