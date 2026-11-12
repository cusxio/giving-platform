import type { Analytics } from '#/modules/analytics'
import { cx } from '#/styles/cx'

import type { Tone } from './format'
import { TONE_CLASS, changeText, count, currency, rateChangeText, rateText } from './format'

interface Kpi {
  change: { text: string; tone: Tone }
  label: string
  prior: string
  value: string
}

export function KpiRow(props: { kpis: Analytics['kpis'] }) {
  const { donors, gaveAgain, gifts, medianGift, received } = props.kpis
  const kpis: Kpi[] = [
    {
      change: changeText(received.value, received.prior),
      label: 'Received',
      prior: currency.format(received.prior),
      value: currency.format(received.value),
    },
    {
      change: changeText(gifts.value, gifts.prior),
      label: 'Gifts',
      prior: count.format(gifts.prior),
      value: count.format(gifts.value),
    },
    {
      change: changeText(donors.value, donors.prior),
      label: 'Donors',
      prior: count.format(donors.prior),
      value: count.format(donors.value),
    },
    {
      change: changeText(medianGift.value, medianGift.prior),
      label: 'Usual gift (median)',
      prior: currency.format(medianGift.prior),
      value: currency.format(medianGift.value),
    },
    {
      change: rateChangeText(gaveAgain.value, gaveAgain.prior),
      label: 'Gave again within 12 months',
      prior: rateText(gaveAgain.prior).main,
      value: rateText(gaveAgain.value).main,
    },
  ]

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {kpis.map((kpi) => (
        <div
          className="flex flex-col gap-y-2 border border-border bg-base-0/50 p-4 last:col-span-2 sm:last:col-span-1"
          key={kpi.label}
        >
          <dt className="text-xs text-fg-subtle">{kpi.label}</dt>
          <dd className="text-2xl text-fg-1 tabular-nums">{kpi.value}</dd>
          <dd className="text-xs tabular-nums">
            <span className={cx(TONE_CLASS[kpi.change.tone])}>{kpi.change.text}</span>{' '}
            <span className="text-fg-subtle">· {kpi.prior} last year</span>
          </dd>
        </div>
      ))}
    </dl>
  )
}
