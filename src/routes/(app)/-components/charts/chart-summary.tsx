import { useCallback } from 'react'

import {
  ChartContainer,
  ChartSummaryItem,
  ChartSummaryLabel,
  ChartSummaryValue,
  ChartTitle,
} from '#/components/ui/chart'
import {
  createCurrencyFormatter,
  createDateFormatter,
  REDACTED_VALUE,
} from '#/core/formatters'

interface ChartSummaryProps {
  averageAmount: number
  largestAmount: number
  largestAmountDate: Date | null
  noOfContributions: number
  privacyMode: boolean
  totalAmount: number
  totalFundsSupported: number
}

export function ChartSummary(props: ChartSummaryProps) {
  const {
    totalAmount,
    noOfContributions,
    averageAmount,
    largestAmount,
    largestAmountDate,
    privacyMode,
    totalFundsSupported,
  } = props

  const currencyFormatter = useCallback(
    (value: number) =>
      createCurrencyFormatter({ showSymbol: true }).format(value, privacyMode),
    [privacyMode],
  )

  const dateFormatter = useCallback((date: Date) => {
    return createDateFormatter({
      month: 'short',
      year: 'numeric',
      day: 'numeric',
    }).format(date)
  }, [])

  return (
    <ChartContainer>
      <ChartTitle>Overview</ChartTitle>

      <div className="flex flex-col gap-y-8 p-4">
        <ChartSummaryItem>
          <ChartSummaryLabel>Total Given</ChartSummaryLabel>
          <ChartSummaryValue className="text-xl sm:text-2xl md:text-3xl">
            {currencyFormatter(totalAmount)}
          </ChartSummaryValue>
        </ChartSummaryItem>

        <div className="grid grid-cols-2 gap-x-1">
          <ChartSummaryItem>
            <ChartSummaryLabel>Transactions</ChartSummaryLabel>
            <ChartSummaryValue>
              {privacyMode ? REDACTED_VALUE : noOfContributions}
            </ChartSummaryValue>
          </ChartSummaryItem>
          <ChartSummaryItem>
            <ChartSummaryLabel>Funds supported</ChartSummaryLabel>
            <ChartSummaryValue>
              {privacyMode ? REDACTED_VALUE : totalFundsSupported}
            </ChartSummaryValue>
          </ChartSummaryItem>
        </div>

        <div className="grid grid-cols-2 gap-x-1">
          <ChartSummaryItem>
            <ChartSummaryLabel>Average Gift</ChartSummaryLabel>
            <ChartSummaryValue>
              {currencyFormatter(averageAmount)}
            </ChartSummaryValue>
          </ChartSummaryItem>

          <ChartSummaryItem>
            <ChartSummaryLabel>Highest Gift</ChartSummaryLabel>
            <ChartSummaryValue>
              {currencyFormatter(largestAmount)}
            </ChartSummaryValue>
            {largestAmountDate && (
              <span className="text-xs text-fg-subtle/80">
                on {dateFormatter(largestAmountDate)}
              </span>
            )}
          </ChartSummaryItem>
        </div>
      </div>
    </ChartContainer>
  )
}
