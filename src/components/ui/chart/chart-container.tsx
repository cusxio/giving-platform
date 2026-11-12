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
        '[&_.recharts-wrapper]:aspect-video [&_.recharts-wrapper]:min-h-0 [&_.recharts-wrapper]:min-w-0',
        '[&_.recharts-wrapper]:px-4 [&_.recharts-wrapper]:pt-4 [&_.recharts-wrapper]:pb-2',
        '[&_.recharts-surface]:outline-hidden',
        '[&_.recharts-sector]:outline-hidden',
        '[&_.recharts-layer]:outline-hidden',
        '**:[[class*="recharts-cartesian-grid"]]:outline-hidden',
        '**:[[id^="recharts-zindex"]]:outline-hidden',
        '[&_.recharts-cartesian-axis-tick-value]:text-xs [&_.recharts-cartesian-axis-tick-value]:text-fg-subtle [&_.recharts-cartesian-axis-tick-value]:select-none',
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
