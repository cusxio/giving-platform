import { Meter } from '#/components/ui/chart'
import type { EveryYear } from '#/modules/analytics'
import { cx } from '#/styles/cx'

import { TONE_CLASS, count, currency, wholeCurrency, yearChangeText } from './format'
import { Panel } from './panel'

export function YearsTable(props: { everyYear: EveryYear }) {
  const { year, years } = props.everyYear
  const largest = Math.max(0, ...years.map((row) => row.received))
  const comparesSameDays = years.some((row) => row.year === year && row.change.kind === 'against')

  return (
    <Panel
      aside={
        comparesSameDays && (
          <span className="text-xs text-fg-subtle">
            {`${year} compares with the same days of ${year - 1}`}
          </span>
        )
      }
      title="Year by year"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-180 text-sm tabular-nums">
          <thead>
            <tr className="text-right text-xs text-fg-subtle">
              <th className="px-4 py-2.5 text-left font-normal" scope="col">
                Year
              </th>
              <th className="w-1/3 px-4 py-2.5 text-left font-normal" scope="col">
                Received
              </th>
              <th className="px-4 py-2.5 font-normal" scope="col">
                Change
              </th>
              <th className="px-4 py-2.5 font-normal" scope="col">
                Gifts
              </th>
              <th className="px-4 py-2.5 font-normal" scope="col">
                Donors
              </th>
              <th className="px-4 py-2.5 font-normal" scope="col">
                Median gift
              </th>
            </tr>
          </thead>
          <tbody>
            {years.map((row) => {
              const change = yearChangeText(row.received, row.change)
              const current = row.year === year
              return (
                <tr className="border-t border-border/60 text-right" key={row.year}>
                  <th
                    className="px-4 py-3 text-left font-normal whitespace-nowrap text-fg-1"
                    scope="row"
                  >
                    {row.year}
                    {current && <span className="ml-1.5 text-xs text-fg-subtle">so far</span>}
                  </th>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-x-3">
                      <Meter
                        className="flex-1"
                        color={current ? 'var(--color-chart-1)' : 'var(--color-fg-subtle)'}
                        label={`${row.year} against the largest year`}
                        value={largest > 0 ? row.received / largest : 0}
                      />
                      <span className="w-28 text-fg-1">{wholeCurrency.format(row.received)}</span>
                    </span>
                  </td>
                  <td className={cx('px-4 py-3 whitespace-nowrap', TONE_CLASS[change.tone])}>
                    {change.text}
                  </td>
                  <td className="px-4 py-3">{count.format(row.gifts)}</td>
                  <td className="px-4 py-3">{count.format(row.donors)}</td>
                  <td className="px-4 py-3">{currency.format(row.median)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
