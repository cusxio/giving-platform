import { config } from '#/core/brand'
import { clientTz, now } from '#/core/date'

export function FooterCopyright() {
  return (
    <footer className="flex h-14 items-center justify-center px-4">
      <p className="text-center text-xs text-fg-subtle">
        © {now(clientTz).getFullYear()} {config.entity.toUpperCase()}. All
        Rights Reserved.
      </p>
    </footer>
  )
}
