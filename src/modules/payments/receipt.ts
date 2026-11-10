import type { User } from '#/modules/account'

interface ReceiptRow<TransactionStatus> {
  readonly payment: { readonly message: string | null } | null
  readonly transaction: { readonly id: string; readonly status: TransactionStatus }
  readonly user: Pick<User, 'email' | 'firstName' | 'status'>
}

export interface TransactionReceipt<TransactionStatus> {
  payment: { message: string | null } | null
  transaction: { id: string; status: TransactionStatus }
  user: TransactionReceiptUser
}

// The email only pre-fills the guest sign-up link, so registered users never get it back.
type TransactionReceiptUser =
  | (Pick<User, 'email' | 'firstName'> & { status: 'guest' })
  | (Pick<User, 'firstName'> & { status: Exclude<User['status'], 'guest'> })

export function toTransactionReceipt<TransactionStatus>(
  row: ReceiptRow<TransactionStatus>,
): TransactionReceipt<TransactionStatus> {
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
