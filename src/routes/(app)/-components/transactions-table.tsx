import { Link } from '@tanstack/react-router'

import { TransactionStatus } from '#/components/transaction-status'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { createCurrencyFormatter, createDateFormatter } from '#/core/formatters'
import { centsToRinggit } from '#/core/money'
import type { Transaction } from '#/db/schema'

interface TransactionsTableProps {
  privacyMode: boolean
  transactions: Pick<Transaction, 'amount' | 'createdAt' | 'id' | 'status'>[]
}

export function TransactionsTable(props: TransactionsTableProps) {
  const { transactions, privacyMode } = props

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-left">Date</TableHead>
          <TableHead className="text-center">Transaction ID</TableHead>
          <TableHead className="text-center">Amount</TableHead>
          <TableHead className="text-right">Status</TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {transactions.map((transaction) => {
          const { amount: amountInCents, createdAt, id, status } = transaction

          return (
            <TableRow className="text-fg-muted/80" key={id}>
              <TableCell className="tabular-nums">
                {createDateFormatter({
                  day: 'numeric',
                  month: 'numeric',
                  year: 'numeric',
                }).format(createdAt)}
              </TableCell>

              <TableCell className="text-center">
                <Link
                  className="font-mono text-fg-info hover:underline"
                  params={{ transactionId: id }}
                  to="/transaction/$transactionId"
                >
                  {id}
                </Link>
              </TableCell>

              <TableCell className="text-center font-mono">
                {createCurrencyFormatter({
                  showSymbol: true,
                  decimal: 'if-needed',
                }).format(centsToRinggit(amountInCents), privacyMode)}
              </TableCell>

              <TableCell className="text-right">
                <TransactionStatus status={status} />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
