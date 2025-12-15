import { createMiddleware } from '@tanstack/react-start'

import { TransactionRepository } from '#/features/transaction/transaction.repository'

import { dbMiddleware } from './db-middleware'

export const transactionRepositoryMiddleware = createMiddleware()
  .middleware([dbMiddleware])
  .server(({ next, context }) => {
    const { db } = context
    const transactionRepository = new TransactionRepository(db)
    return next({ context: { transactionRepository } })
  })
