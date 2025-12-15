import type { Payment, Transaction } from '#/db/schema'
import { cx } from '#/styles/cx'

import { ReturnToHome } from './return-to-home'
import { TransactionStatusLayout } from './transaction-status-layout'

interface FailedProps {
  payment?: Pick<Payment, 'message'>
  transaction: Pick<Transaction, 'id' | 'status'>
}

export function Failed(props: FailedProps) {
  const { transaction, payment } = props
  const { status } = transaction
  const isCancelled =
    payment?.message?.toLowerCase().includes('cancel') ?? false

  const h1 = isCancelled
    ? 'Transaction Cancelled'
    : 'There Was an Issue With Your Payment'
  const p = isCancelled
    ? 'Changed your mind? Don’t worry about it! We still love you!'
    : 'We’re sorry, but it seems there was a hiccup during your transaction. Your payment could not be processed successfully at this time. Don’t worry, though – these things happen.'

  return (
    <TransactionStatusLayout h1={h1} p={p} status={status}>
      {isCancelled ? (
        <ReturnToHome />
      ) : (
        <>
          <div
            className={cx(
              'grid gap-y-4 text-sm',
              'border border-border bg-base-0 p-4',
            )}
          >
            <p className="text-fg-1">Here’s what you can do next:</p>
            <ol
              className={cx(
                'ml-4 grid list-outside list-decimal gap-y-4',
                '[&_li]:leading-6 [&_li]:text-fg-muted',
                '[&_strong]:font-medium [&_strong]:text-fg-1/90',
              )}
            >
              <li>
                <strong>Check Your Payment Information:</strong> Double-check
                the payment details you provided to ensure they are accurate.
                Sometimes a small typo can cause a payment to fail.
              </li>
              <li>
                <strong>Payment Method:</strong> If you were using a credit
                card, debit card, or another payment method, make sure it’s
                valid and has sufficient funds.
              </li>
              <li>
                <strong>Try Again:</strong> You can attempt the transaction
                again. Sometimes, a second try is all it takes.
              </li>
              <li>
                <strong>Contact Us:</strong> If the problem persists or you have
                any other questions, feel free to reach out for help.
              </li>
            </ol>
          </div>
          <ReturnToHome />
        </>
      )}
    </TransactionStatusLayout>
  )
}
