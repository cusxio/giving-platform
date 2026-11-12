import { SegmentedBar } from '#/components/ui/chart'
import type { Analytics } from '#/modules/analytics'

import { count, currency, percent } from './format'
import { Panel } from './panel'

const SIGNED_IN = 'var(--color-fg-1)'
const GUEST = 'var(--color-fg-subtle)'

export function SignedInGuestPanel(props: { split: Analytics['signedInGuest'] }) {
  const { guest, user } = props.split
  const rows = [
    {
      format: (value: number) => currency.format(value),
      guest: guest.amount,
      label: 'Share of money',
      user: user.amount,
    },
    {
      format: (value: number) => count.format(value),
      guest: guest.gifts,
      label: 'Share of gifts',
      user: user.gifts,
    },
  ]

  return (
    <Panel title="Signed in or guest">
      <div className="flex flex-col gap-y-5 p-4">
        {rows.map((row) => {
          const total = row.user + row.guest
          return (
            <div className="flex flex-col gap-y-2" key={row.label}>
              <h3 className="text-xs text-fg-subtle">{row.label}</h3>
              <SegmentedBar
                label={row.label}
                segments={[
                  { color: SIGNED_IN, label: 'Signed in', value: row.user },
                  { color: GUEST, label: 'Guest', value: row.guest },
                ]}
              />
              <div className="flex justify-between gap-x-3 text-sm tabular-nums">
                <span className="text-fg-1">
                  Signed in {total > 0 ? percent(row.user / total) : '0%'}
                  <span className="ml-1.5 text-fg-subtle">{row.format(row.user)}</span>
                </span>
                <span className="text-fg-muted">
                  Guest {total > 0 ? percent(row.guest / total) : '0%'}
                  <span className="ml-1.5 text-fg-subtle">{row.format(row.guest)}</span>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
