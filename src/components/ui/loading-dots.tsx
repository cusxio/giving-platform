import { cx } from '#/styles/cx'

interface LoadingDotsProps {
  size: `w-${number} h-${number}` | `w-[${number}px] h-[${number}px]`
}

export function LoadingDots(props: LoadingDotsProps) {
  const { size } = props
  return (
    <span className="inline-flex gap-x-1">
      <span
        className={cx(
          size,
          'animate-[plop_1s_ease-in-out_infinite_0.1s] rounded-full bg-surface',
        )}
      />
      <span
        className={cx(
          size,
          'animate-[plop_1s_ease-in-out_infinite_0.2s] rounded-full bg-surface',
        )}
      />
      <span
        className={cx(
          size,
          'animate-[plop_1s_ease-in-out_infinite_0.4s] rounded-full bg-surface',
        )}
      />
    </span>
  )
}
