export const PAGE_SIZE = 20

/** `txs` passes through untouched, so it keeps the caller's row type. */
export function toTransactionsPage<Row>(total: readonly { readonly value: number }[], txs: Row[]) {
  return { pageSize: PAGE_SIZE, totalCount: total[0]?.value ?? 0, transactions: txs }
}
