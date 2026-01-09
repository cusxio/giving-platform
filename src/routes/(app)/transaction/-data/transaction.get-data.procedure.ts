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

export const getTransactionData = createServerFn()
  .middleware([dbMiddleware, transactionRepositoryMiddleware])
  .inputValidator((v: Input) => v)
  .handler(async ({ context, data }) => {
    const { transactionId } = data
    const { db, transactionRepository, user } = context
    const result = await db.batch([
      transactionRepository.findTransactionByIdQuery(transactionId, db),
      transactionRepository.findTransactionItemsByTransactionIdQuery(
        transactionId,
        db,
      ),
    ])

    const [[transaction], transactionItems] = result

    if (
      transaction === undefined ||
      transaction.userId !== user?.id ||
      transactionItems.length === 0
    ) {
      throw notFound()
    }

    return [transaction, transactionItems]
  })
