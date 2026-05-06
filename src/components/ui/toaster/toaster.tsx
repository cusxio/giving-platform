import type { CSSProperties } from 'react'
import { Toaster as SonnerToaster } from 'sonner'

export default function Toaster() {
  return (
    <SonnerToaster
      richColors
      style={
        {
          '--border-radius': 0,
          '--error-bg': 'var(--base-error)',
          '--error-text': 'var(--fg-error)',
          '--info-bg': 'var(--base-info)',
          '--info-text': 'var(--fg-info)',
          '--success-bg': 'var(--base-success)',
          '--success-text': 'var(--fg-success)',
          '--warning-bg': 'var(--base-warning)',
          '--warning-text': 'var(--fg-warning)',
        } as CSSProperties
      }
      theme="dark"
    />
  )
}
