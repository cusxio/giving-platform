import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

import { dbMiddleware } from '#/server/middleware/db-middleware'
import { transactionRepositoryMiddleware } from '#/server/middleware/transaction-repository-middleware'
import { userRepositoryMiddleware } from '#/server/middleware/user-repository-middleware'

export const getWelcomeData = createServerFn()
  .middleware([dbMiddleware, userRepositoryMiddleware, transactionRepositoryMiddleware])
  .handler(async ({ context }) => {
    const { db, userRepository, transactionRepository, user } = context
    const userId = user?.id

    if (userId === undefined) {
      throw notFound()
    }

    const [[foundUser], [exists]] = await db.batch([
      userRepository.findUserByIdQuery(userId),
      transactionRepository.findGuestTransactionExistsByUserIdQuery(userId),
    ])

    if (foundUser === undefined) {
      throw notFound()
    }

    return { guestTransactionExists: Boolean(exists), user: foundUser }
  })
