import { notFound, redirect } from '@tanstack/react-router'
import { Type } from 'typebox'
import { Compile } from 'typebox/compile'

import { createDBError, createParseError } from '#/core/errors'
import { trySync, tryAsync } from '#/core/result'
import type {
  AuthErrorResponse,
  ServerErrorResponse,
  SuccessResponse,
  ValidationErrorResponse,
} from '#/core/wire'
import { hasGuestTransaction } from '#/modules/payments/server'
import type { Deps } from '#/server/deps.server'
import { legacyDb } from '#/server/legacy-db.server'
import type { RequestContext } from '#/server/request-context.server'

import type { UserSettings } from './user-settings.repository.server'
import { findSettingsByUserId, upsertPrivacyMode } from './user-settings.repository.server'
import type { User } from './users.repository.server'
import { findUserById, updateUserById } from './users.repository.server'

type Ctx = Pick<RequestContext, 'deps' | 'user'>

type CurrentUserResponse =
  | AuthErrorResponse
  | SuccessResponse<{ user: User; userSettings: UserSettings }>

interface Welcome {
  readonly guestTransactionExists: boolean
  readonly user: User
}

const profileSchema = Compile(
  Type.Object({
    firstName: Type.Optional(Type.String({ maxLength: 32, minLength: 1 })),
    journey: Type.Optional(Type.Union([Type.Literal('start_fresh'), Type.Literal('migrate')])),
    lastName: Type.Optional(Type.String({ maxLength: 32, minLength: 1 })),
  }),
)

export type UpdateUserInput = ReturnType<typeof profileSchema.Parse>

type UpdateUserResponse =
  | ServerErrorResponse
  | SuccessResponse<{ user: User }>
  | ValidationErrorResponse

export interface UpdatePrivacyModeInput {
  privacyMode: boolean
}

type UpdatePrivacyModeResponse =
  | AuthErrorResponse<string>
  | ServerErrorResponse
  | SuccessResponse<UserSettings>

/** The signed-in user's account row and settings; a user without settings gets the defaults. */
export async function loadCurrentUser(
  deps: Pick<Deps, 'db' | 'logger'>,
  userId: User['id'],
): Promise<CurrentUserResponse> {
  const [user, settings] = await legacyDb(deps.db).batch([
    findUserById(userId),
    findSettingsByUserId(userId),
  ])

  if (user === null) {
    deps.logger.warn(
      { event: 'auth.get_user.integrity_failed', user_id: userId },
      'Session valid but user not found in DB',
    )
    return { type: 'AUTH_ERROR' }
  }

  return {
    type: 'SUCCESS',
    value: { user, userSettings: settings ?? { privacyMode: false, userId: user.id } },
  }
}

/** Null when the account row is gone. */
export async function loadWelcome(
  deps: Pick<Deps, 'db'>,
  userId: User['id'],
): Promise<Welcome | null> {
  const [user, guestTransactionExists] = await legacyDb(deps.db).batch([
    findUserById(userId),
    hasGuestTransaction(userId),
  ])
  return user === null ? null : { guestTransactionExists, user }
}

/** Trims the names, validates, and saves the given profile fields. */
export async function updateProfile(
  deps: Pick<Deps, 'db' | 'logger'>,
  userId: User['id'],
  data: UpdateUserInput,
): Promise<UpdateUserResponse> {
  const { logger } = deps
  const { firstName, lastName, ...dataRest } = data
  const parseResult = trySync(
    () =>
      profileSchema.Parse({
        firstName: firstName?.trim(),
        lastName: lastName?.trim(),
        ...dataRest,
      }),
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

  const userResult = await tryAsync(
    () => legacyDb(deps.db).run(updateUserById(userId, parseResult.value)),
    createDBError,
  )

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
}

export async function updatePrivacy(
  deps: Pick<Deps, 'db' | 'logger'>,
  userId: User['id'],
  privacyMode: boolean,
): Promise<UpdatePrivacyModeResponse> {
  const { logger } = deps

  logger.info(
    { event: 'user.update_privacy.attempt', privacy_mode: privacyMode },
    'Updating privacy mode',
  )

  const result = await tryAsync(
    () => legacyDb(deps.db).run(upsertPrivacyMode(userId, privacyMode)),
    createDBError,
  )

  if (!result.ok) {
    logger.error(
      { err: result.error, event: 'user.update_privacy.failed' },
      'DB failed to update privacy mode',
    )
    return { type: 'SERVER_ERROR' }
  }

  if (!result.value) {
    logger.error(
      { event: 'user.update_privacy.empty_result' },
      'Update query executed but returned no record',
    )
    return { type: 'SERVER_ERROR' }
  }

  logger.info({ event: 'user.update_privacy.success' }, 'Privacy mode updated')

  return { type: 'SUCCESS', value: result.value }
}

// Transport adapters. Phase 2 replaces the null-user guards with `requireUser` middleware.

export async function getCurrentUserProcedure(context: Ctx): Promise<CurrentUserResponse> {
  if (!context.user) {
    context.deps.logger.debug(
      { event: 'auth.get_user.guest' },
      'No session found, returning AUTH_ERROR',
    )
    return { type: 'AUTH_ERROR' }
  }
  return loadCurrentUser(context.deps, context.user.id)
}

export async function getWelcomeProcedure(context: Ctx): Promise<Welcome> {
  if (!context.user) {
    throw notFound()
  }
  const welcome = await loadWelcome(context.deps, context.user.id)
  if (welcome === null) {
    throw notFound()
  }
  return welcome
}

export async function updateUserProcedure(
  context: Ctx,
  data: UpdateUserInput,
): Promise<undefined | UpdateUserResponse> {
  if (!context.user) {
    context.deps.logger.warn(
      { event: 'user.update_user.unauthorized' },
      'Unauthorized update attempt',
    )
    throw redirect({ to: '/auth/login' })
  }
  return updateProfile(context.deps, context.user.id, data)
}

export async function updatePrivacyModeProcedure(
  context: Ctx,
  data: UpdatePrivacyModeInput,
): Promise<UpdatePrivacyModeResponse> {
  if (!context.user) {
    context.deps.logger.warn(
      { event: 'user.update_privacy.unauthorized' },
      'Unauthorized privacy update',
    )
    return { message: 'You must be logged in to continue.', type: 'AUTH_ERROR' }
  }
  return updatePrivacy(context.deps, context.user.id, data.privacyMode)
}
