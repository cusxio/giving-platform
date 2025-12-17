import { useStoreState } from '@ariakit/react'
import { useMemo } from 'react'

import type { TransactionItemsTableProps } from '#/components/transaction-items-table'
import { TransactionItemsTable } from '#/components/transaction-items-table'
import { Button } from '#/components/ui/button'
import { PaymentMethods } from '#/components/ui/payment-methods'
import { UserFormFields } from '#/components/user-form-fields'
import { funds } from '#/core/brand'
import { ringgitToCents } from '#/core/money'
import { SavedPaymentMethod } from '#/db/schema'
import { useLogoutMutation } from '#/features/auth/auth.mutations'

import type { GivingFormStore } from './use-giving-form'

interface GivingFormDetailsProps {
  authenticated: boolean
  savedPaymentMethods: SavedPaymentMethod[]
  store: GivingFormStore
}

export function GivingFormDetails(props: GivingFormDetailsProps) {
  const { store, authenticated, savedPaymentMethods } = props
  const { values } = useStoreState(store)
  const { firstName, lastName, email } = values

  const transactionItems = useMemo(() => {
    const txItems: TransactionItemsTableProps['transactionItems'] = []

    for (const fund of funds) {
      const amount = Number(values[fund])

      if (Number.isNaN(amount) || amount <= 0) {
        continue
      }

      txItems.push({ fundName: fund, amountInCents: ringgitToCents(amount) })
    }

    return txItems
  }, [values])

  const logout = useLogoutMutation()

  return (
    <div className="flex flex-col gap-y-4 pb-10">
      <div className="flex flex-col gap-y-4 border border-border bg-base-0 p-4">
        <div className="text-lg">1. Your Details</div>
        {authenticated ? (
          <div className="flex flex-col gap-y-1">
            <div className="flex items-center gap-x-4 text-fg-muted">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-elevated">
                {firstName.charAt(0)}
              </span>
              <div>
                <div>
                  {firstName} {lastName}
                </div>
                <div className="text-sm">{email}</div>
              </div>
            </div>

            <div className="ml-auto">
              <Button
                className="text-xs font-medium text-fg-subtle hover:underline"
                onClick={() => {
                  logout.mutate()
                }}
              >
                Not you? Sign out
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-y-4">
            <UserFormFields
              emailReadOnly={authenticated}
              nameReadOnly={authenticated}
              store={store}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-y-6 border border-border bg-base-0 p-4 pb-8">
        <div className="text-lg">2. Gift Summary</div>

        <TransactionItemsTable transactionItems={transactionItems} />
      </div>

      {savedPaymentMethods.length > 0 && (
        <div className="flex flex-col gap-y-6 border border-border bg-base-0 p-4">
          <div className="text-lg">3. Payment Method</div>

          <PaymentMethods
            savedPaymentMethods={savedPaymentMethods}
            store={store}
          />
        </div>
      )}
    </div>
  )
}
