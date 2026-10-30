import type { QueryResult } from '#/server/db.server'

import type { countTransactions, transactionsPage } from './history.repository.server'

export const PAGE_SIZE = 20

export type TransactionsPage = ReturnType<typeof toTransactionsPage>

/** A row of the transactions list and of the overview's recent transactions. */
export type TransactionRow = TransactionsPage['transactions'][number]

export function toTransactionsPage(
  total: QueryResult<typeof countTransactions>,
  txs: QueryResult<typeof transactionsPage>,
) {
  return { pageSize: PAGE_SIZE, totalCount: total[0]?.value ?? 0, transactions: txs }
}
