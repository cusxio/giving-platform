import { createFileRoute } from '@tanstack/react-router'

import { FooterCopyright } from '#/components/footer-copyright'
import { HeaderLogo } from '#/components/header-logo'
import { useSuspenseQueryDeferred } from '#/hooks/use-suspense-query-deferred'
import { receiptQuery } from '#/modules/payments'

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

function RouteComponent() {
  const { transactionId } = Route.useParams()
  const {
    data: { transaction, user, payment },
  } = useSuspenseQueryDeferred(receiptQuery(transactionId))

  return (
    <>
      <HeaderLogo />

      <div className="relative flex shrink-0 grow flex-col items-center justify-center px-4">
        <div className="mx-auto max-w-3xl">
          {transaction.status === 'success' && <Success transaction={transaction} user={user} />}

          {transaction.status === 'failed' && (
            <Failed payment={payment ?? undefined} transaction={transaction} />
          )}

          {transaction.status === 'pending' && <Pending transaction={transaction} />}

          {transaction.status === 'held' && <Held transaction={transaction} />}
        </div>
      </div>

      <FooterCopyright />
    </>
  )
}
