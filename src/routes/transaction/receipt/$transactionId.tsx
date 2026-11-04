import { createFileRoute } from '@tanstack/react-router'

import { FooterCopyright } from '#/components/footer-copyright'
import { HeaderLogo } from '#/components/header-logo'
import { assertExhaustive } from '#/core/assert-exhaustive'
import { useSuspenseQueryDeferred } from '#/hooks/use-suspense-query-deferred'
import type { Receipt } from '#/modules/payments'
import { receiptQuery } from '#/modules/payments'

import { Cancelled } from './-components/cancelled'
import { Failed } from './-components/failed'
import { Held } from './-components/held'
import { Pending } from './-components/pending'
import { Success } from './-components/success'

export const Route = createFileRoute('/transaction/receipt/$transactionId')({
  component: RouteComponent,

  async loader({ params, context }) {
    const { queryClient } = context
    const { transactionId } = params
    await queryClient.query({ ...receiptQuery(transactionId), staleTime: 'static' })
  },
})

function ReceiptView(props: Receipt) {
  const { transaction, user, payment } = props
  switch (transaction.status) {
    case 'success': {
      return <Success transaction={transaction} user={user} />
    }
    case 'failed': {
      return <Failed payment={payment ?? undefined} transaction={transaction} />
    }
    case 'cancelled': {
      return <Cancelled transaction={transaction} />
    }
    case 'pending': {
      return <Pending transaction={transaction} />
    }
    case 'held': {
      return <Held transaction={transaction} />
    }
    default: {
      return assertExhaustive(transaction.status)
    }
  }
}

function RouteComponent() {
  const { transactionId } = Route.useParams()
  const { data } = useSuspenseQueryDeferred(receiptQuery(transactionId))

  return (
    <>
      <HeaderLogo />

      <div className="relative flex shrink-0 grow flex-col items-center justify-center px-4">
        <div className="mx-auto max-w-3xl">
          <ReceiptView {...data} />
        </div>
      </div>

      <FooterCopyright />
    </>
  )
}
