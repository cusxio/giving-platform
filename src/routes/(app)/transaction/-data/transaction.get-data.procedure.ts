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
    const { db, transactionRepository } = context
    const result = await db.batch([
      transactionRepository.findTransactionByIdQuery(transactionId, db),
      transactionRepository.findTransactionItemsByTransactionIdQuery(
        transactionId,
        db,
      ),
    ])

    return result
  })
