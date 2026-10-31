import type { QueryResult } from '#/server/db.server'

import type { findReceipt } from './transactions.repository.server'

type ReceiptRow = NonNullable<QueryResult<typeof findReceipt>>
type ReceiptRowUser = ReceiptRow['user']

export interface TransactionReceipt {
  payment: ReceiptRow['payment']
  transaction: ReceiptRow['transaction']
  user: TransactionReceiptUser
}

// The email only pre-fills the guest sign-up link, so registered users never get it back.
type TransactionReceiptUser =
  | (Pick<ReceiptRowUser, 'email' | 'firstName'> & { status: 'guest' })
  | (Pick<ReceiptRowUser, 'firstName'> & { status: Exclude<ReceiptRowUser['status'], 'guest'> })

export function toTransactionReceipt(row: ReceiptRow): TransactionReceipt {
  const { payment, transaction, user } = row

  return {
    payment: payment === null ? null : { message: payment.message },
    transaction: { id: transaction.id, status: transaction.status },
    user:
      user.status === 'guest'
        ? { email: user.email, firstName: user.firstName, status: user.status }
        : { firstName: user.firstName, status: user.status },
  }
}
