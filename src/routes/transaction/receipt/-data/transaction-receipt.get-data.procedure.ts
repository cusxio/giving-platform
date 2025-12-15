import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

import type { Transaction } from '#/db/schema'
import {
  dbMiddleware,
  transactionRepositoryMiddleware,
} from '#/server/middleware'

interface Input {
  transactionId: Transaction['id']
}

export const getTransactionReceiptData = createServerFn()
  .middleware([dbMiddleware, transactionRepositoryMiddleware])
  .inputValidator((v: Input) => v)
  .handler(async ({ context, data }) => {
    const { transactionId } = data
    const { db, transactionRepository, logger } = context

    const [queryResult] =
      await transactionRepository.findFullTransactionByIdQuery(
        transactionId,
        db,
      )

    if (queryResult === undefined) {
      logger.warn(
        {
          event: 'transaction.receipt.not_found',
          transaction_id: transactionId,
        },
        'Receipt not found',
      )
      throw notFound()
    }

    return {
      user: queryResult.user,
      payment: queryResult.payment,
      transaction: queryResult.transaction,
    }
  })
