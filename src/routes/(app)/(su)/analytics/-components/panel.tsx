import type { ReactNode } from 'react'

import { ChartContainer } from '#/components/ui/chart'
import { cx } from '#/styles/cx'

interface PanelProps {
  aside?: ReactNode
  children: ReactNode
  className?: string
  title: string
}

/** A titled card. It sits on ChartContainer so a chart inside gets the app's chart styles. */
export function Panel(props: PanelProps) {
  const { aside, children, className, title } = props
  return (
    <ChartContainer className={cx('min-w-0', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 px-4 py-3">
        <h2 className="text-sm text-fg-muted">{title}</h2>
        {aside}
      </div>
      {children}
    </ChartContainer>
  )
}

export function Takeaway(props: { children: ReactNode }) {
  return <p className="px-4 pt-3 text-sm text-fg-default">{props.children}</p>
}

export function Note(props: { children: ReactNode; className?: string }) {
  return <p className={cx('text-xs text-fg-subtle', props.className)}>{props.children}</p>
}

export function Swatch(props: { color: string }) {
  return (
    <span
      aria-hidden
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: props.color }}
    />
  )
}
