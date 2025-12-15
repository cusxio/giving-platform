import { config } from '#/core/brand'

export function FooterCopyright() {
  return (
    <footer className="flex h-14 items-center justify-center px-4">
      <p className="text-center text-xs text-fg-subtle">
        © 2025 {config.entity.toUpperCase()}. All Rights Reserved.
      </p>
    </footer>
  )
}
