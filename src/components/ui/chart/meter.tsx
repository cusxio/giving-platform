import { cx } from '#/styles/cx'

const clamp = (value: number) => Math.min(1, Math.max(0, value))
const percent = (value: number) => `${(clamp(value) * 100).toFixed(2)}%`

interface MeterProps {
  className?: string
  color?: string
  /** Names what the bar measures, for screen readers. */
  label: string
  /** A reference point on the same 0 to 1 scale, drawn as a tick, such as a benchmark. */
  marker?: { label: string; value: number }
  /** The filled share, from 0 to 1. */
  value: number
}

export function Meter(props: MeterProps) {
  const { className, color = 'var(--color-chart-2)', label, marker, value } = props
  return (
    <div className={cx('relative h-1.5 rounded-full bg-elevated', className)}>
      <span className="sr-only">
        {label}: {Math.round(clamp(value) * 100)}%
        {marker && `, ${marker.label}: ${Math.round(clamp(marker.value) * 100)}%`}
      </span>
      <div
        aria-hidden
        className="h-full rounded-full"
        style={{ backgroundColor: color, width: percent(value) }}
      />
      {marker && (
        <div
          aria-hidden
          className="absolute -inset-y-1 w-0.5 bg-fg-default"
          style={{ left: percent(marker.value) }}
          title={marker.label}
        />
      )}
    </div>
  )
}

interface Segment {
  color: string
  label: string
  value: number
}

interface SegmentedBarProps {
  className?: string
  /** Names the whole, such as "Returning donors by change". */
  label: string
  segments: readonly Segment[]
}

/** Parts of one whole side by side, each as wide as its share of the total. */
export function SegmentedBar(props: SegmentedBarProps) {
  const { className, label, segments } = props
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  return (
    <div className={cx('flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-elevated', className)}>
      <span className="sr-only">
        {label}: {segments.map((segment) => `${segment.label} ${segment.value}`).join(', ')}
      </span>
      {total > 0 &&
        segments.map((segment) => (
          <div
            aria-hidden
            key={segment.label}
            style={{ backgroundColor: segment.color, width: percent(segment.value / total) }}
            title={`${segment.label}: ${segment.value}`}
          />
        ))}
    </div>
  )
}
