import type { getOverview, getTransactions } from './history.functions'

/** Derived from the wire, so client code never reads the schema. */
export type Overview = Awaited<ReturnType<typeof getOverview>>

/** A row of the transactions list and of the overview's recent transactions. */
export type TransactionRow = Awaited<ReturnType<typeof getTransactions>>['transactions'][number]
