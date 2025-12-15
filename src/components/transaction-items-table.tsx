import { useMemo } from 'react'

import { createCurrencyFormatter } from '#/core/formatters'
import { centsToRinggit } from '#/core/money'
import { cx } from '#/styles/cx'

export interface TransactionItemsTableProps {
  transactionItems: { amountInCents: number; fundName: string }[]
}

const itemRow = cx(
  'px-2 py-1',
  'flex items-center justify-between gap-x-2',
  'text-sm',
)

export function TransactionItemsTable(props: TransactionItemsTableProps) {
  const { transactionItems } = props

  const currencyFormatter = useMemo(() => {
    return createCurrencyFormatter({ showSymbol: true })
  }, [])

  const totalAmountInCents = useMemo(() => {
    return transactionItems.reduce((acc, curr) => {
      return acc + curr.amountInCents
    }, 0)
  }, [transactionItems])

  return (
    <div>
      {transactionItems.map(({ fundName, amountInCents }) => (
        <div className={cx(itemRow, 'text-fg-muted/80')} key={fundName}>
          <span className="capitalize">{fundName}</span>
          <span className="font-mono">
            {currencyFormatter.format(centsToRinggit(amountInCents))}
          </span>
        </div>
      ))}
      <div className={cx(itemRow, 'mt-2 border-t border-border font-medium')}>
        <span>Total</span>
        <span className="font-mono">
          {currencyFormatter.format(centsToRinggit(totalAmountInCents))}
        </span>
      </div>
    </div>
  )
}
