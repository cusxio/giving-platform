import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

// Import {
//   AuthErrorResponse,
//   SuccessResponse,
// } from '#/core/procedure-response-types'
// Import { User } from '#/db/schema'
import {
  dbMiddleware,
  transactionRepositoryMiddleware,
  userRepositoryMiddleware,
} from '#/server/middleware'

// Type GetWelcomeDataResponse =
//   | AuthErrorResponse
//   | SuccessResponse<{ exists: boolean; user: User }>

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
