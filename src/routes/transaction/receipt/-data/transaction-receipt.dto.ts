import type { Payment, Transaction, User } from '#/db/schema'

export interface TransactionReceipt {
  payment: null | Pick<Payment, 'message'>
  transaction: Pick<Transaction, 'id' | 'status'>
  user: TransactionReceiptUser
}

// The email only pre-fills the guest sign-up link, so registered users never get it back.
export type TransactionReceiptUser =
  | (Pick<User, 'email' | 'firstName'> & { status: 'guest' })
  | (Pick<User, 'firstName'> & { status: Exclude<User['status'], 'guest'> })

interface TransactionReceiptRow {
  payment: null | Pick<Payment, 'message'>
  transaction: Pick<Transaction, 'id' | 'status'>
  user: Pick<User, 'email' | 'firstName' | 'status'>
}

export function toTransactionReceipt(row: TransactionReceiptRow): TransactionReceipt {
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
