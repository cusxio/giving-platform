import { useCallback } from 'react'

import {
  ChartContainer,
  ChartSummaryItem,
  ChartSummaryLabel,
  ChartSummaryValue,
  ChartTitle,
} from '#/components/ui/chart'
import { createCurrencyFormatter } from '#/core/formatters'

interface InsightsSummaryProps {
  averageAmount: number
  medianAmount: number
  noOfContributions: number
  totalAmount: number
}

export function InsightsSummary(props: InsightsSummaryProps) {
  const { totalAmount, noOfContributions, averageAmount, medianAmount } = props

  const currencyFormatter = useCallback(
    (value: number) =>
      createCurrencyFormatter({ showSymbol: true }).format(value),
    [],
  )

  const noOfContributionsFormatter = useCallback((value: number) => {
    return new Intl.NumberFormat().format(value)
  }, [])

  return (
    <ChartContainer>
      <ChartTitle>Summary</ChartTitle>

      <div className="flex flex-col gap-y-8 p-4">
        <ChartSummaryItem>
          <ChartSummaryLabel>Total Given</ChartSummaryLabel>
          <ChartSummaryValue className="text-xl sm:text-2xl md:text-3xl">
            {currencyFormatter(totalAmount)}
          </ChartSummaryValue>
        </ChartSummaryItem>

        <ChartSummaryItem>
          <ChartSummaryLabel>Transactions</ChartSummaryLabel>
          <ChartSummaryValue>
            {noOfContributionsFormatter(noOfContributions)}
          </ChartSummaryValue>
        </ChartSummaryItem>

        <div className="grid grid-cols-2 gap-x-1">
          <ChartSummaryItem>
            <ChartSummaryLabel>Median Amount</ChartSummaryLabel>
            <ChartSummaryValue>
              {currencyFormatter(medianAmount)}
            </ChartSummaryValue>
          </ChartSummaryItem>

          <ChartSummaryItem>
            <ChartSummaryLabel>Average Amount</ChartSummaryLabel>
            <ChartSummaryValue>
              {currencyFormatter(averageAmount)}
            </ChartSummaryValue>
          </ChartSummaryItem>
        </div>
      </div>
    </ChartContainer>
  )
}
