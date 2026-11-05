import { notFound } from '@tanstack/react-router'

import type { Deps } from '#/server/deps.server'
import type { RequestContext } from '#/server/request-context.server'

import { toTransactionReceipt } from './receipt'
import type { TransactionId } from './transactions.repository.server'
import { findReceipt } from './transactions.repository.server'

export interface ReceiptInput {
  readonly transactionId: TransactionId
}

/** Null when no transaction has the id. Anyone holding the id may read the receipt. */
export async function loadReceipt(deps: Pick<Deps, 'db'>, transactionId: TransactionId) {
  const row = await deps.db.run(findReceipt(transactionId))
  return row === null ? null : toTransactionReceipt(row)
}

export async function getReceiptProcedure(
  context: Pick<RequestContext, 'deps'>,
  data: ReceiptInput,
) {
  const { transactionId } = data
  const receipt = await loadReceipt(context.deps, transactionId)

  if (receipt === null) {
    context.deps.logger.warn(
      { event: 'transaction.receipt.not_found', transaction_id: transactionId },
      'Receipt not found',
    )
    throw notFound()
  }

  return receipt
}
