import type { getReceipt, getSavedPaymentMethods } from './payments.functions'

/** Derived from the wire, so client code never reads the schema. */
export type Receipt = Awaited<ReturnType<typeof getReceipt>>

export type SavedPaymentMethod = Awaited<ReturnType<typeof getSavedPaymentMethods>>[number]
