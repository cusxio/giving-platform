import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import { Link } from '@tanstack/react-router'

export function ReturnToHome() {
  return (
    <Link
      className="inline-flex items-center gap-x-1 text-sm text-fg-subtle hover:underline"
      replace
      to="/"
    >
      <CaretLeftIcon />
      Return to Home
    </Link>
  )
}
