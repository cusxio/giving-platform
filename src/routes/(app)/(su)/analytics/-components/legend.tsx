import type { ReactNode } from 'react'

import { cx } from '#/styles/cx'

interface LegendItem {
  color: string
  label: string
  /** A line for a tick or series line, a square for an area. */
  shape?: 'line' | 'square'
}

export function Legend(props: { children?: ReactNode; items: readonly LegendItem[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-3 text-xs text-fg-muted">
      {props.items.map((item) => (
        <li className="flex items-center gap-x-1.5" key={item.label}>
          <span
            aria-hidden
            className={cx(item.shape === 'line' ? 'h-0.5 w-3.5' : 'size-2 rounded-xs')}
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </li>
      ))}
      {props.children}
    </ul>
  )
}
