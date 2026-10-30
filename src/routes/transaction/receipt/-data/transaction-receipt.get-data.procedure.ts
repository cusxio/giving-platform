import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

import type { Transaction } from '#/db/schema'
import { dbMiddleware } from '#/server/middleware/db-middleware'
import { transactionRepositoryMiddleware } from '#/server/middleware/transaction-repository-middleware'

import { toTransactionReceipt } from './transaction-receipt.dto'

interface Input {
  transactionId: Transaction['id']
}

export const getTransactionReceiptData = createServerFn()
  .middleware([dbMiddleware, transactionRepositoryMiddleware])
  .validator((v: Input) => v)
  .handler(async ({ context, data }) => {
    const { transactionId } = data
    const { db, transactionRepository, logger } = context

    const [queryResult] = await transactionRepository.findFullTransactionByIdQuery(
      transactionId,
      db,
    )

    if (queryResult === undefined) {
      logger.warn(
        { event: 'transaction.receipt.not_found', transaction_id: transactionId },
        'Receipt not found',
      )
      throw notFound()
    }

    return toTransactionReceipt(queryResult)
  })
