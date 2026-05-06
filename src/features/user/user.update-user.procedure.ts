import { redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import type { Static } from 'typebox'
import { Type } from 'typebox'
import { Compile } from 'typebox/compile'

import { createParseError } from '#/core/errors'
import type {
  ServerErrorResponse,
  SuccessResponse,
  ValidationErrorResponse,
} from '#/core/procedure-response-types'
import { trySync } from '#/core/result'
import type { User } from '#/db/schema'
import { userRepositoryMiddleware } from '#/server/middleware'

const schema = Compile(
  Type.Object({
    firstName: Type.Optional(Type.String({ maxLength: 32, minLength: 1 })),
    journey: Type.Optional(Type.Union([Type.Literal('start_fresh'), Type.Literal('migrate')])),
    lastName: Type.Optional(Type.String({ maxLength: 32, minLength: 1 })),
  }),
)

export type UpdateUserInput = Static<typeof schema>

export type UpdateUserResponse =
  | ServerErrorResponse
  | SuccessResponse<{ user: User }>
  | ValidationErrorResponse

export const updateUser = createServerFn({ method: 'POST' })
  .middleware([userRepositoryMiddleware])
  .inputValidator((v: UpdateUserInput) => v)
  .handler(async ({ data, context }): Promise<undefined | UpdateUserResponse> => {
    const { logger, user, userRepository } = context

    const userId = user?.id
    if (userId === undefined) {
      logger.warn({ event: 'user.update_user.unauthorized' }, 'Unauthorized update attempt')
      throw redirect({ to: '/auth/login' })
    }

    const { firstName, lastName, ...dataRest } = data
    const parseResult = trySync(
      () => schema.Parse({ firstName: firstName?.trim(), lastName: lastName?.trim(), ...dataRest }),
      createParseError,
    )

    if (!parseResult.ok) {
      logger.warn(
        {
          err: parseResult.error.error,
          error_type: parseResult.error.type,
          event: 'user.update_user.validation_failed',
        },
        'Input validation failed',
      )

      return {
        errors: parseResult.error.error.cause.errors.map((v) => ({
          path: v.instancePath,
          message: v.message,
        })),
        type: 'VALIDATION_ERROR',
      }
    }

    logger.info(
      { event: 'user.update_user.attempt', fields: Object.keys(data), user_id: userId },
      'Updating user profile',
    )

    const userResult = await userRepository.updateUserById(userId, parseResult.value)

    if (!userResult.ok) {
      logger.error(
        {
          err: userResult.error.error,
          error_type: userResult.error.type,
          event: 'user.update_user.failed',
        },
        'DB failed to update user profile',
      )
      return { type: 'SERVER_ERROR' }
    }

    if (!userResult.value) {
      logger.error(
        { event: 'user.update_user.empty_result' },
        'Update query executed but returned no record',
      )
      return { type: 'SERVER_ERROR' }
    }

    logger.info({ event: 'user.update_user.success', user_id: userId }, 'User updated successfully')

    return { type: 'SUCCESS', value: { user: userResult.value } }
  })
