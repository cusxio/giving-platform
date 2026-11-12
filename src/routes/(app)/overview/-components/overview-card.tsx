import type { ReactNode } from 'react'

import { cx } from '#/styles/cx'

interface OverviewCardProps {
  children: ReactNode
  className?: string
  title: ReactNode
}

export function OverviewCard(props: OverviewCardProps) {
  const { children, className, title } = props
  return (
    <section className={cx('flex min-w-0 flex-col border border-border bg-base-0/50', className)}>
      <h2 className="border-b border-border/80 px-4 py-3 text-sm text-fg-muted">{title}</h2>
      {children}
    </section>
  )
}
