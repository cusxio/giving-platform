import { createServerFn } from '@tanstack/react-start'

import type {
  AuthErrorResponse,
  SuccessResponse,
} from '#/core/procedure-response-types'
import type { User, UserSettings } from '#/db/schema'
import {
  dbMiddleware,
  userRepositoryMiddleware,
  userSettingsRepositoryMiddleware,
} from '#/server/middleware'

export type GetUserResponse =
  | AuthErrorResponse
  | SuccessResponse<{ user: User; userSettings: UserSettings }>

export const getUser = createServerFn()
  .middleware([
    dbMiddleware,
    userRepositoryMiddleware,
    userSettingsRepositoryMiddleware,
  ])
  .handler(async ({ context }): Promise<GetUserResponse> => {
    const { session, db, userRepository, userSettingsRepository, logger } =
      context

    if (session?.userId === undefined) {
      logger.debug(
        { event: 'auth.get_user.guest' },
        'No session found, returning AUTH_ERROR',
      )
      return { type: 'AUTH_ERROR' }
    }

    const userId = session.userId
    const [[user], userSettingsResult] = await db.batch([
      userRepository.findUserByIdQuery(userId),
      userSettingsRepository.findByUserIdQuery(userId),
    ])

    if (user === undefined) {
      logger.warn(
        { event: 'auth.get_user.integrity_failed', user_id: userId },
        'Session valid but user not found in DB',
      )
      return { type: 'AUTH_ERROR' }
    }

    return {
      type: 'SUCCESS',
      value: {
        user,
        userSettings: userSettingsResult[0] ?? {
          userId: user.id,
          privacyMode: false,
        },
      },
    }
  })
