import {
  InvoiceIcon,
  MagnifyingGlassIcon,
} from '@phosphor-icons/react/dist/ssr'
import { createElement } from 'react'

interface ReportEmptyProps {
  reason: 'idle' | 'no-data'
}

export function ReportEmpty(props: ReportEmptyProps) {
  const { reason } = props
  const idle = reason === 'idle'
  const icon = idle ? InvoiceIcon : MagnifyingGlassIcon
  return (
    <div className="flex flex-col items-center gap-y-4 border border-border bg-base-0 px-2 py-8">
      {createElement(icon, { size: 24 })}
      <h1 className="text-center text-balance">
        {idle
          ? 'Select a date range to generate a report'
          : 'No contributions found in this date range'}
      </h1>
      <p className="text-center text-sm text-balance text-fg-muted">
        {idle
          ? 'Contribution data will appear here once the chosen period includes activity.'
          : 'Try selecting another period to view available data.'}
      </p>
    </div>
  )
}
