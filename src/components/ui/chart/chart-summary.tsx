import type { ReactNode } from 'react'

import { cx } from '#/styles/cx'

export function ChartSummaryItem(props: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cx('flex flex-col gap-y-1', props.className)}>
      {props.children}
    </div>
  )
}

export function ChartSummaryLabel(props: { children: ReactNode }) {
  return (
    <span className="text-xs text-fg-subtle uppercase">{props.children}</span>
  )
}

export function ChartSummaryValue(props: {
  children: ReactNode
  className?: string
}) {
  return (
    <span className={cx('tabular-nums', props.className)}>
      {props.children}
    </span>
  )
}
