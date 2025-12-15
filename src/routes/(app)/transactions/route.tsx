import { HandHeartIcon, ReceiptIcon } from '@phosphor-icons/react/dist/ssr'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Type } from 'typebox'
import type { Static } from 'typebox'
import { Compile } from 'typebox/compile'

import { Button, buttonVariants } from '#/components/ui/button'
import { Pagination } from '#/components/ui/pagination'
import { config } from '#/core/brand'
import { createParseError } from '#/core/errors'
import { trySync } from '#/core/result'
import { useAuthUser } from '#/features/session/session.queries'
import { useSuspenseQueryDeferred } from '#/hooks'
import { cx } from '#/styles/cx'

import { TransactionsTable } from '../-components/transactions-table'

import { createTransactionsQueryOptions } from './-transactions.queries'

const schema = Compile(Type.Object({ page: Type.Optional(Type.Number()) }))

export const Route = createFileRoute('/(app)/transactions')({
  validateSearch(search): Static<typeof schema> {
    const parseResult = trySync(() => schema.Parse(search), createParseError)

    if (!parseResult.ok) {
      return { page: undefined }
    }

    return { page: parseResult.value.page }
  },

  beforeLoad({ search }) {
    return { page: search.page ?? 1 }
  },

  async loader({ context }) {
    const {
      user: { id: userId, journey },
      page,
      queryClient,
    } = context

    await queryClient.ensureQueryData(
      createTransactionsQueryOptions(userId, journey, page),
    )
  },

  component: RouteComponent,

  head: () => ({ meta: [{ title: `Transactions · ${config.entity}` }] }),
})

function RouteComponent() {
  const { page } = Route.useRouteContext()
  const {
    user: { id: userId, journey },
    userSettings: { privacyMode },
  } = useAuthUser()

  const {
    data: { totalCount, transactions, pageSize },
  } = useSuspenseQueryDeferred(
    createTransactionsQueryOptions(userId, journey, page),
  )

  const pageCount = Math.ceil(totalCount / pageSize)

  if (transactions.length === 0) {
    return (
      <div
        className={cx(
          'flex shrink-0 grow flex-col items-center justify-center',
          'mx-auto w-full max-w-xl gap-y-4 p-4',
        )}
      >
        <ReceiptIcon className="text-fg-1" size={48} />

        <div className="mb-8 flex flex-col gap-y-4 text-center">
          <h1 className="text-2xl">You don’t have any transactions yet</h1>
          <p className="text-balance text-fg-muted">
            Once you make your first gift, it will appear here.
          </p>
        </div>

        <Button
          className={cx(buttonVariants.lime, 'h-10 gap-x-2')}
          render={<Link to="/" />}
        >
          Make your first contribution
          <HandHeartIcon size={20} weight="duotone" />
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-4">
      <h2 className="border-x border-t border-border bg-base-0 px-4 py-3 text-fg-muted">
        Transactions
      </h2>
      <div className="no-scrollbar overflow-auto">
        <TransactionsTable
          privacyMode={privacyMode}
          transactions={transactions}
        />
      </div>

      <div className="my-4">
        <Pagination page={page} pageCount={pageCount} to="/transactions" />
      </div>
    </div>
  )
}
