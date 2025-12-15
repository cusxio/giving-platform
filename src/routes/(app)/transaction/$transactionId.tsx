import { createFileRoute, notFound } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { TransactionItemsTable } from '#/components/transaction-items-table'
import { TransactionStatus } from '#/components/transaction-status'
import { clientTz, formatDistanceToNow, TZDate } from '#/core/date'
import { createCurrencyFormatter, createDateFormatter } from '#/core/formatters'
import { centsToRinggit } from '#/core/money'
import { useSuspenseQueryDeferred } from '#/hooks'

import { createTransactionQueryOptions } from './-transaction.queries'

export const Route = createFileRoute('/(app)/transaction/$transactionId')({
  component: RouteComponent,

  async loader({ params, context }) {
    const { queryClient } = context
    const { transactionId } = params

    const [[transaction], transactionItems] = await queryClient.ensureQueryData(
      createTransactionQueryOptions(transactionId),
    )

    if (transaction === undefined || transactionItems.length === 0) {
      throw notFound()
    }
  },
})

function RouteComponent() {
  const { transactionId } = Route.useParams()
  const { data } = useSuspenseQueryDeferred(
    createTransactionQueryOptions(transactionId),
  )
  const [[transaction], transactionItems] = data
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const { id, createdAt, amount: amountInCents, status } = transaction!

  return (
    <div className="mx-auto w-full max-w-lg p-4">
      <div className="grid gap-y-4">
        <div>
          <TransactionStatus status={status} />
        </div>

        <div>
          <SubHeading>Transaction Id</SubHeading>
          <div className="font-mono text-fg-default">{id}</div>
        </div>

        <div>
          <SubHeading>Total</SubHeading>
          <div className="font-mono">
            {createCurrencyFormatter({ showSymbol: true }).format(
              centsToRinggit(amountInCents),
            )}
          </div>
        </div>

        <div>
          <SubHeading>Date</SubHeading>
          <div>
            <span>
              {`${createDateFormatter({
                dateStyle: 'full',
                hourCycle: 'h12',
                timeStyle: 'short',
              }).format(createdAt)} `}
            </span>
            <span className="text-sm text-fg-subtle">
              ({formatDistanceToNow(new TZDate(createdAt, clientTz))} ago)
            </span>
          </div>
        </div>

        <div className="mt-16">
          <SubHeading>Details</SubHeading>
          <TransactionItemsTable transactionItems={transactionItems} />
        </div>
      </div>
    </div>
  )
}

function SubHeading(props: { children: ReactNode }) {
  return (
    <div className="mb-2 text-xs text-fg-muted uppercase">{props.children}</div>
  )
}
