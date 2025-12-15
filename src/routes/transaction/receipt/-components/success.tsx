import { ArrowRightIcon, InfoIcon } from '@phosphor-icons/react/dist/ssr'
import { Link } from '@tanstack/react-router'
import { Suspense } from 'react'

import { Button, buttonVariants } from '#/components/ui/button'
import type { Transaction, User } from '#/db/schema'
import { cx } from '#/styles/cx'

import { Confetti } from './confetti'
import { TransactionStatusLayout } from './transaction-status-layout'

interface SuccessProps {
  transaction: Pick<Transaction, 'id' | 'status'>
  user: Pick<User, 'email' | 'firstName' | 'status'>
}

export function Success(props: SuccessProps) {
  const { transaction, user } = props
  const { status } = transaction

  return (
    <>
      <Suspense>
        <Confetti />
      </Suspense>
      <TransactionStatusLayout
        h1={`Thank you${user.firstName === null ? '' : `, ${user.firstName}`}!`}
        p="Your gift makes a real difference. We’re deeply grateful for your generosity."
        status={status}
      >
        {user.status === 'guest' ? (
          <>
            <p className="flex items-center gap-x-2 bg-base-info p-2 text-sm text-fg-info">
              <InfoIcon size={18} />
              <span>
                You can now create an account to give faster and view your
                history
              </span>
            </p>
            <Button
              className={cx('h-8 gap-x-2', buttonVariants.subtle)}
              render={
                <Link search={{ email: user.email }} to="/welcome/signup" />
              }
            >
              Create an account
              <ArrowRightIcon size={16} weight="bold" />
            </Button>
          </>
        ) : (
          <Link
            className="text-sm text-fg-info hover:underline"
            params={{ transactionId: transaction.id }}
            to="/transaction/$transactionId"
          >
            View Transaction
          </Link>
        )}
      </TransactionStatusLayout>
    </>
  )
}
