import { FUND_CHART_COLOR_MAP } from '#/core/brand/funds'
import { fundOf } from '#/modules/history'
import { cx } from '#/styles/cx'

/** The text colour class of a fund's chart colour, so `bg-current` and `currentColor` paint it. */
export function fundColorClass(fundName: string) {
  const fund = fundOf(fundName)
  return fund ? FUND_CHART_COLOR_MAP[fund] : 'text-fg-subtle'
}

function FundDot(props: { fundName: string }) {
  return (
    <span
      aria-hidden
      className={cx('size-2 shrink-0 rounded-full bg-current', fundColorClass(props.fundName))}
    />
  )
}

export function FundName(props: { fundName: string }) {
  return (
    <span className="inline-flex items-center gap-x-2">
      <FundDot fundName={props.fundName} />
      {props.fundName}
    </span>
  )
}
