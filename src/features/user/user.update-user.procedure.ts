import { redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { Type } from 'typebox'
import type { Static } from 'typebox'
import { Compile } from 'typebox/compile'

import { createParseError } from '#/core/errors'
import type {
  ServerErrorResponse,
  SuccessResponse,
  ValidationErrorResponse,
} from '#/core/procedure-response-types'
import { trySync } from '#/core/result'
import { User } from '#/db/schema'
import { userRepositoryMiddleware } from '#/server/middleware'

const schema = Compile(
  Type.Object({
    firstName: Type.Optional(Type.String({ minLength: 1, maxLength: 32 })),
    lastName: Type.Optional(Type.String({ minLength: 1, maxLength: 32 })),
    journey: Type.Optional(
      Type.Union([Type.Literal('start_fresh'), Type.Literal('migrate')]),
    ),
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
  .handler(
    async ({ data, context }): Promise<undefined | UpdateUserResponse> => {
      const { session, logger, userRepository } = context

      if (session === null) {
        logger.warn(
          { event: 'user.update_user.unauthorized' },
          'Unauthorized update attempt',
        )
        throw redirect({ to: '/auth/login' })
      }

      const { firstName, lastName, ...dataRest } = data
      const parseResult = trySync(
        () =>
          schema.Parse({
            firstName: firstName?.trim(),
            lastName: lastName?.trim(),
            ...dataRest,
          }),
        createParseError,
      )

      if (!parseResult.ok) {
        logger.warn(
          {
            event: 'user.update_user.validation_failed',
            err: parseResult.error.error,
            error_type: parseResult.error.type,
          },
          'Input validation failed',
        )

        return {
          type: 'VALIDATION_ERROR',
          errors: parseResult.error.error.cause.errors.map((v) => {
            return { path: v.instancePath, message: v.message }
          }),
        }
      }

      logger.info(
        {
          event: 'user.update_user.attempt',
          user_id: session.userId,
          fields: Object.keys(data),
        },
        'Updating user profile',
      )

      const userResult = await userRepository.updateUserById(
        session.userId,
        parseResult.value,
      )

      if (!userResult.ok) {
        logger.error(
          {
            event: 'user.update_user.failed',
            err: userResult.error.error,
            error_type: userResult.error.type,
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

      logger.info(
        { event: 'user.update_user.success', user_id: session.userId },
        'User updated successfully',
      )

      return { type: 'SUCCESS', value: { user: userResult.value } }
    },
  )
