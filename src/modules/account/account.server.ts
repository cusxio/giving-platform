import { notFound } from '@tanstack/react-router'

import type { AuthErrorResponse, SuccessResponse } from '#/core/wire'
import { hasGuestTransaction } from '#/modules/payments/server'
import type { Deps } from '#/server/deps.server'
import type { RequestContext } from '#/server/request-context.server'

import type { UserSettings } from './user-settings.repository.server'
import { findSettingsByUserId } from './user-settings.repository.server'
import type { User } from './users.repository.server'
import { findUserById } from './users.repository.server'

type Ctx = Pick<RequestContext, 'deps' | 'user'>

type CurrentUserResponse =
  | AuthErrorResponse
  | SuccessResponse<{ user: User; userSettings: UserSettings }>

interface Welcome {
  readonly guestTransactionExists: boolean
  readonly user: User
}

/** The signed-in user's account row and settings; a user without settings gets the defaults. */
export async function loadCurrentUser(
  deps: Pick<Deps, 'db' | 'logger'>,
  userId: User['id'],
): Promise<CurrentUserResponse> {
  const [user, settings] = await deps.db.batch([findUserById(userId), findSettingsByUserId(userId)])

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
  const [user, guestTransactionExists] = await deps.db.batch([
    findUserById(userId),
    hasGuestTransaction(userId),
  ])
  return user === null ? null : { guestTransactionExists, user }
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
