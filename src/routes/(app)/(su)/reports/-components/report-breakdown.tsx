import { useMemo } from 'react'

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { createCurrencyFormatter } from '#/core/formatters'

interface ReportBreakdownProps {
  data: { createdAs: 'guest' | 'user'; fundName: string; totalAmount: number }[]
}

export function ReportBreakdown(props: ReportBreakdownProps) {
  const { data } = props

  const currencyFormatter = useMemo(() => {
    return createCurrencyFormatter({ showSymbol: true })
  }, [])

  const grandTotal = useMemo(() => {
    return data.reduce((acc, curr) => {
      return acc + curr.totalAmount
    }, 0)
  }, [data])

  return (
    <Table>
      <TableHeader className="bg-base-0">
        <TableRow>
          <TableHead className="text-left">Fund</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((group) => {
          return (
            <TableRow
              className="text-fg-muted"
              key={`${group.fundName}-${group.createdAs}`}
            >
              <TableCell className="flex items-center gap-x-1">
                {group.fundName}
                {group.createdAs === 'guest' && (
                  <span className="text-xs text-fg-subtle">(guest)</span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {currencyFormatter.format(group.totalAmount)}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
      <TableFooter className="bg-base-0">
        <TableRow>
          <TableCell>Total</TableCell>
          <TableCell className="text-right tabular-nums">
            {currencyFormatter.format(grandTotal)}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
}
