import { notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

// import {
//   AuthErrorResponse,
//   SuccessResponse,
// } from '#/core/procedure-response-types'
// import { User } from '#/db/schema'
import {
  dbMiddleware,
  transactionRepositoryMiddleware,
  userRepositoryMiddleware,
} from '#/server/middleware'

// type GetWelcomeDataResponse =
//   | AuthErrorResponse
//   | SuccessResponse<{ exists: boolean; user: User }>

export const getWelcomeData = createServerFn()
  .middleware([
    dbMiddleware,
    userRepositoryMiddleware,
    transactionRepositoryMiddleware,
  ])
  .handler(async ({ context }) => {
    const { session, db, userRepository, transactionRepository } = context
    if (session?.userId === undefined) {
      throw notFound()
    }

    const userId = session.userId
    const [[user], [exists]] = await db.batch([
      userRepository.findUserByIdQuery(userId),
      transactionRepository.findGuestTransactionExistsByUserIdQuery(userId),
    ])

    if (user === undefined) {
      throw notFound()
    }

    return { user, guestTransactionExists: exists ? true : false }
  })
