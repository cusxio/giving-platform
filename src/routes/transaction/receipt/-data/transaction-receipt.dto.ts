import type { Payment, Transaction, User } from '#/db/schema'

interface TransactionReceiptRow {
  payment: null | Payment
  transaction: Transaction
  user: User
}

export function toTransactionReceipt(row: TransactionReceiptRow) {
  return { payment: row.payment, transaction: row.transaction, user: row.user }
}
