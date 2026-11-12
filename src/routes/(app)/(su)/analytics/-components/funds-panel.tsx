import { useCallback } from 'react'

import { Button, buttonVariants } from '#/components/ui/button'
import { Meter } from '#/components/ui/chart'
import type { Analytics } from '#/modules/analytics'
import { cx } from '#/styles/cx'

import { TONE_CLASS, changeText, count, currency, fundColor, percent } from './format'
import { fundsCsv, fundsCsvName } from './funds-csv'
import { Note, Panel, Swatch } from './panel'

function downloadCsv(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

interface FundsPanelProps {
  funds: Analytics['funds']
  gifts: number
  period: Analytics['period']
}

export function FundsPanel(props: FundsPanelProps) {
  const { funds, gifts, period } = props
  const total = funds.reduce(
    (sum, fund) => ({
      amount: sum.amount + fund.amount,
      guest: sum.guest + fund.guest,
      prior: sum.prior + fund.prior,
      signedIn: sum.signedIn + fund.signedIn,
    }),
    { amount: 0, guest: 0, prior: 0, signedIn: 0 },
  )
  const largest = Math.max(0, ...funds.map((fund) => fund.amount))
  const totalChange = changeText(total.amount, total.prior)

  const exportCsv = useCallback(() => {
    downloadCsv(fundsCsvName(period), fundsCsv(funds))
  }, [funds, period])

  return (
    <Panel
      aside={
        <Button
          className={cx(buttonVariants.subtle, 'h-8')}
          disabled={funds.length === 0}
          onClick={exportCsv}
        >
          Export CSV
        </Button>
      }
      title="Funds"
    >
      {funds.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-fg-muted">No gifts in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-180 text-sm tabular-nums">
            <thead>
              <tr className="text-right text-xs text-fg-subtle">
                <th className="px-4 py-2.5 text-left font-normal" scope="col">
                  Fund
                </th>
                <th className="px-4 py-2.5 font-normal" scope="col">
                  Received
                </th>
                <th className="w-1/5 px-4 py-2.5 text-left font-normal" scope="col">
                  Share
                </th>
                <th className="px-4 py-2.5 font-normal" scope="col">
                  Same days last year
                </th>
                <th className="px-4 py-2.5 font-normal" scope="col">
                  Gifts
                </th>
                <th className="px-4 py-2.5 font-normal" scope="col">
                  Signed in
                </th>
                <th className="px-4 py-2.5 font-normal" scope="col">
                  Guest
                </th>
              </tr>
            </thead>
            <tbody>
              {funds.map((fund) => {
                const change = changeText(fund.amount, fund.prior)
                const share = total.amount > 0 ? fund.amount / total.amount : 0
                return (
                  <tr className="border-t border-border/60 text-right" key={fund.fundName}>
                    <th className="px-4 py-3 text-left font-normal text-fg-1" scope="row">
                      <span className="flex items-center gap-x-2">
                        <Swatch color={fundColor(fund.fundName)} />
                        {fund.fundName}
                      </span>
                    </th>
                    <td className="px-4 py-3 text-fg-1">{currency.format(fund.amount)}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-x-2.5">
                        <Meter
                          className="flex-1"
                          color={fundColor(fund.fundName)}
                          label={`${fund.fundName} share of money`}
                          value={largest > 0 ? fund.amount / largest : 0}
                        />
                        <span className="w-10 text-fg-muted">{percent(share)}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {currency.format(fund.prior)}{' '}
                      <span className={cx('block text-xs', TONE_CLASS[change.tone])}>
                        {change.text}
                      </span>
                    </td>
                    <td className="px-4 py-3">{count.format(fund.gifts)}</td>
                    <td className="px-4 py-3">{currency.format(fund.signedIn)}</td>
                    <td className="px-4 py-3">{currency.format(fund.guest)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border text-right text-fg-1">
                <th className="px-4 py-3 text-left font-normal" scope="row">
                  Total
                </th>
                <td className="px-4 py-3">{currency.format(total.amount)}</td>
                <td className="px-4 py-3 text-left text-fg-muted">100%</td>
                <td className="px-4 py-3">
                  {currency.format(total.prior)}{' '}
                  <span className={cx('block text-xs', TONE_CLASS[totalChange.tone])}>
                    {totalChange.text}
                  </span>
                </td>
                <td className="px-4 py-3">{count.format(gifts)}</td>
                <td className="px-4 py-3">{currency.format(total.signedIn)}</td>
                <td className="px-4 py-3">{currency.format(total.guest)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <Note className="px-4 pt-1 pb-3">
        A gift split across funds counts once in each fund, so fund gift counts can add up to more
        than the total of {count.format(gifts)}.
      </Note>
    </Panel>
  )
}
