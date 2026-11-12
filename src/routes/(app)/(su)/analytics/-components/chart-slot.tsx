import type { ReactNode } from 'react'
import { Suspense } from 'react'

export function ChartSlot(props: { children: ReactNode }) {
  return <Suspense fallback={<div className="h-60" />}>{props.children}</Suspense>
}
