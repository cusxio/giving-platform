import type { ReactNode } from 'react'

import { cx } from '#/styles/cx'

interface ChartContainerProps {
  children: ReactNode
  className?: string
}
export function ChartContainer(props: ChartContainerProps) {
  const { className, ...rest } = props
  return (
    <div
      className={cx(
        'flex flex-col',
        'overflow-hidden border border-border bg-base-0/50',
        '[&_.ts-chart-host]:text-fg-subtle [&_.ts-chart-host]:select-none',
        '[&_.ts-chart:focus:not(:focus-visible)]:outline-none',
        '[--ts-chart-tooltip-background:var(--color-base-1)] [--ts-chart-tooltip-color:var(--color-fg-default)]',
        '[--ts-chart-tooltip-border-radius:0] [--ts-chart-tooltip-border:1px_solid_var(--color-border)] [--ts-chart-tooltip-shadow:none]',
        className,
      )}
      {...rest}
    />
  )
}
