import { createServerFn } from '@tanstack/react-start'

import { createDBError } from '#/core/errors'
import type {
  AuthErrorResponse,
  ServerErrorResponse,
  SuccessResponse,
} from '#/core/procedure-response-types'
import { tryAsync } from '#/core/result'
import type { UserSettings } from '#/db/schema'
import { userSettings as userSettingsTable } from '#/db/schema'
import { dbMiddleware } from '#/server/middleware'

export interface UpdatePrivacyModeInput {
  privacyMode: boolean
}

export type UpdatePrivacyModeResponse =
  | AuthErrorResponse<string>
  | ServerErrorResponse
  | SuccessResponse<UserSettings>

export const updatePrivacyMode = createServerFn({ method: 'POST' })
  .middleware([dbMiddleware])
  .inputValidator((v: UpdatePrivacyModeInput) => v)
  .handler(async ({ context, data }): Promise<UpdatePrivacyModeResponse> => {
    const { db, user, logger } = context
    const { privacyMode } = data

    const userId = user?.id

    if (userId === undefined) {
      logger.warn(
        { event: 'user.update_privacy.unauthorized' },
        'Unauthorized privacy update',
      )
      return {
        type: 'AUTH_ERROR',
        message: 'You must be logged in to continue.',
      }
    }

    logger.info(
      { event: 'user.update_privacy.attempt', privacy_mode: privacyMode },
      'Updating privacy mode',
    )

    const result = await tryAsync(
      () =>
        db
          .insert(userSettingsTable)
          .values({ userId, privacyMode })
          .onConflictDoUpdate({
            target: userSettingsTable.userId,
            set: { privacyMode },
          })
          .returning(),
      createDBError,
    )

    if (!result.ok) {
      logger.error(
        { event: 'user.update_privacy.failed', err: result.error },
        'DB failed to update privacy mode',
      )
      return { type: 'SERVER_ERROR' }
    }

    const userSettings = result.value[0]

    if (!userSettings) {
      logger.error(
        { event: 'user.update_privacy.empty_result' },
        'Update query executed but returned no record',
      )
      return { type: 'SERVER_ERROR' }
    }

    logger.info(
      { event: 'user.update_privacy.success' },
      'Privacy mode updated',
    )

    return { type: 'SUCCESS', value: userSettings }
  })
