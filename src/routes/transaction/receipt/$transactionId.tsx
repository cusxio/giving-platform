import { createFileRoute } from '@tanstack/react-router'

import { FooterCopyright } from '#/components/footer-copyright'
import { HeaderLogo } from '#/components/header-logo'
import { useSuspenseQueryDeferred } from '#/hooks'

import { Failed } from './-components/failed'
import { Pending } from './-components/pending'
import { Success } from './-components/success'
import { createTransactionQueryOptions } from './-transaction-receipt.queries'

export const Route = createFileRoute('/transaction/receipt/$transactionId')({
  async loader({ params, context }) {
    const { queryClient } = context
    const { transactionId } = params
    await queryClient.ensureQueryData(
      createTransactionQueryOptions(transactionId),
    )
  },

  component: RouteComponent,
})

function RouteComponent() {
  const { transactionId } = Route.useParams()
  const {
    data: { transaction, user, payment },
  } = useSuspenseQueryDeferred(createTransactionQueryOptions(transactionId))

  return (
    <>
      <HeaderLogo />

      <div className="relative flex shrink-0 grow flex-col items-center justify-center px-4">
        <div className="mx-auto max-w-3xl">
          {transaction.status === 'success' && (
            <Success transaction={transaction} user={user} />
          )}

          {transaction.status === 'failed' && (
            <Failed payment={payment ?? undefined} transaction={transaction} />
          )}

          {transaction.status === 'pending' && (
            <Pending transaction={transaction} />
          )}
        </div>
      </div>

      <FooterCopyright />
    </>
  )
}
