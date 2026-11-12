import { Meter, SegmentedBar } from '#/components/ui/chart'
import type { Analytics } from '#/modules/analytics'
import { cx } from '#/styles/cx'

import { count, percent, shareText } from './format'
import { Note, Panel, Swatch } from './panel'

/** Payment method codes as eGHL records them. */
const METHOD_NAMES: Record<string, string> = {
  CC: 'Card',
  DD: 'Online banking (FPX)',
  WA: 'E-wallet',
}

const methodName = (method: string | null) =>
  method === null ? 'Not recorded' : (METHOD_NAMES[method] ?? method)

/** Below this paid share a method's rate reads as a warning. */
const LOW_PAID_SHARE = 0.9

export function PaymentsPanel(props: { payments: Analytics['payments'] }) {
  const methods = props.payments
    .map((row) => ({ ...row, attempts: row.succeeded + row.failed + row.cancelled }))
    // oxlint-disable-next-line unicorn/no-array-sort -- Avoid toSorted until the runtime lib supports it.
    .sort((a, b) => b.attempts - a.attempts)
  const attempts = methods.reduce((sum, row) => sum + row.attempts, 0)
  const outcomes = [
    {
      color: 'var(--color-fg-success)',
      label: 'Paid',
      value: methods.reduce((sum, row) => sum + row.succeeded, 0),
    },
    {
      color: 'var(--color-fg-error)',
      label: 'Failed',
      value: methods.reduce((sum, row) => sum + row.failed, 0),
    },
    {
      color: 'var(--color-fg-subtle)',
      label: 'Not completed',
      value: methods.reduce((sum, row) => sum + row.cancelled, 0),
    },
  ]

  return (
    <Panel title="Payments">
      {attempts === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-fg-muted">
          No payment attempts in this period.
        </p>
      ) : (
        <div className="flex flex-col md:flex-row md:flex-wrap">
          <div className="flex min-w-0 flex-1 basis-96 flex-col gap-y-3 p-4">
            <h3 className="text-xs text-fg-subtle">
              Each method&apos;s share of attempts, and how often one was paid
            </h3>
            <ul className="flex flex-col gap-y-3 text-sm">
              {methods.map((row) => {
                const paid = shareText(row.succeeded, row.attempts)
                return (
                  <li
                    className="grid grid-cols-[9rem_minmax(0,1fr)_3rem_6rem] items-center gap-x-3"
                    key={row.method ?? ''}
                  >
                    <span className="truncate text-fg-1">{methodName(row.method)}</span>
                    <Meter
                      color="var(--color-fg-default)"
                      label={`${methodName(row.method)} share of attempts`}
                      value={row.attempts / attempts}
                    />
                    <span className="text-right tabular-nums">
                      {percent(row.attempts / attempts)}
                    </span>
                    <span
                      className={cx(
                        'text-right tabular-nums',
                        paid !== null && row.succeeded / row.attempts < LOW_PAID_SHARE
                          ? 'text-red-fg'
                          : 'text-fg-muted',
                      )}
                    >
                      {paid ?? `${count.format(row.succeeded)} of ${count.format(row.attempts)}`}{' '}
                      paid
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
          <div className="flex min-w-0 flex-1 basis-96 flex-col gap-y-3 border-t border-border p-4 md:border-t-0 md:border-l">
            <h3 className="text-xs text-fg-subtle">
              What happened to {count.format(attempts)} payment attempts
            </h3>
            <SegmentedBar label="Payment attempts by outcome" segments={outcomes} />
            <ul className="flex flex-col gap-y-2 text-sm">
              {outcomes.map((outcome) => {
                const share = shareText(outcome.value, attempts)
                return (
                  <li className="flex justify-between gap-x-3" key={outcome.label}>
                    <span className="flex items-center gap-x-2">
                      <Swatch color={outcome.color} />
                      {outcome.label}
                    </span>
                    <span className="text-fg-1 tabular-nums">
                      {count.format(outcome.value)}
                      {share !== null && <span className="ml-1.5 text-fg-subtle">{share}</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
            <Note>Not completed means the payment page closed or timed out unpaid.</Note>
          </div>
        </div>
      )}
    </Panel>
  )
}
