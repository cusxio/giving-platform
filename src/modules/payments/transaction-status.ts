import type { Receipt } from './payments.types'

/** The schema's transaction status enum, read off the receipt wire type so UI never imports it. */
export type TransactionStatus = Receipt['transaction']['status']
