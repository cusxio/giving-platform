import { cx } from '#/styles/cx'

interface SpinnerProps {
  className: string
}

export function Spinner(props: SpinnerProps) {
  const { className } = props
  return (
    <svg
      className={cx('animate-spin', className)}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
    >
      <path d="M12 3v3m6.366-.366-2.12 2.12M21 12h-3m.366 6.366-2.12-2.12M12 21v-3m-6.366.366 2.12-2.12M3 12h3m-.366-6.366 2.12 2.12" />
    </svg>
  )
}
