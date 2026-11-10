import { Result } from 'better-result'
import { Type } from 'typebox'
import { Compile } from 'typebox/compile'

import { hasGuestTransaction } from '#/modules/payments/server'
import { SignedOut, anyone, requireUser } from '#/server/authorize.server'
import type { Deps } from '#/server/deps.server'
import { required } from '#/server/infra-error'
import type { Parsed } from '#/server/input.server'
import { noInput, parseWith } from '#/server/input.server'
import { defineMutation, defineRead, returning, toNotFound } from '#/server/procedure.server'

import { AccountNotFound } from './account.errors'
import { upsertPrivacyMode } from './user-settings.repository.server'
import type { User } from './users.repository.server'
import { findUserById, updateUserById } from './users.repository.server'

export async function loadWelcome(deps: Pick<Deps, 'db'>, userId: User['id']) {
  const read = await deps.db.batch([findUserById(userId), hasGuestTransaction(userId)])
  return read.andThen(([user, guestTransactionExists]) =>
    user === null
      ? Result.err(new AccountNotFound({ userId }))
      : Result.ok({ guestTransactionExists, user }),
  )
}

const profileInput = parseWith(
  Compile(
    Type.Object({
      firstName: Type.Optional(Type.String({ maxLength: 32, minLength: 1 })),
      journey: Type.Optional(Type.Union([Type.Literal('start_fresh'), Type.Literal('migrate')])),
      lastName: Type.Optional(Type.String({ maxLength: 32, minLength: 1 })),
    }),
  ),
  { trim: ['firstName', 'lastName'] },
)
export type UpdateUserInput = Parsed<typeof profileInput>

/** Saves the given profile fields. */
export async function updateProfile(
  deps: Pick<Deps, 'db' | 'logger'>,
  userId: User['id'],
  changes: UpdateUserInput,
) {
  deps.logger.info(
    { event: 'user.update_user.attempt', fields: Object.keys(changes), user_id: userId },
    'Updating user profile',
  )
  const updated = await deps.db.run(updateUserById(userId, changes))
  return updated
    .andThen((user) => required(user, updateUserById.queryName))
    .map((user) => {
      deps.logger.info(
        { event: 'user.update_user.success', user_id: userId },
        'User updated successfully',
      )
      return { user }
    })
}

export async function updatePrivacy(
  deps: Pick<Deps, 'db' | 'logger'>,
  userId: User['id'],
  privacyMode: boolean,
) {
  deps.logger.info(
    { event: 'user.update_privacy.attempt', privacy_mode: privacyMode },
    'Updating privacy mode',
  )
  const saved = await deps.db.run(upsertPrivacyMode(userId, privacyMode))
  return saved
    .andThen((settings) => required(settings, upsertPrivacyMode.queryName))
    .map((settings) => {
      deps.logger.info({ event: 'user.update_privacy.success' }, 'Privacy mode updated')
      return settings
    })
}

/**
 * Answers envelopes, as a mutation does, because the client still branches on `AUTH_ERROR`.
 * Phase 4 turns it into a plain read.
 */
export const getCurrentUserAction = defineMutation({
  auth: anyone,
  event: 'auth.get_user',
  input: noInput,
  run: (ctx) =>
    Promise.resolve(
      ctx.user === null
        ? Result.err(new SignedOut())
        : Result.ok({ user: ctx.user, userSettings: ctx.userSettings }),
    ),
  wire: {
    SignedOut: () =>
      returning(
        { type: 'AUTH_ERROR' },
        {
          event: 'auth.get_user.guest',
          level: 'debug',
          msg: 'No session found, returning AUTH_ERROR',
        },
      ),
  },
})

export const getWelcomeAction = defineRead({
  auth: requireUser,
  event: 'user.get_welcome',
  input: noInput,
  run: ({ deps, user }) => loadWelcome(deps, user.id),
  wire: { AccountNotFound: () => toNotFound() },
})

export const updateUserAction = defineMutation({
  auth: requireUser,
  event: 'user.update_user',
  input: profileInput,
  run: ({ deps, user }, changes) => updateProfile(deps, user.id, changes),
  wire: {},
})

const privacyModeInput = parseWith(Compile(Type.Object({ privacyMode: Type.Boolean() })))
export type UpdatePrivacyModeInput = Parsed<typeof privacyModeInput>

export const updatePrivacyModeAction = defineMutation({
  auth: requireUser,
  event: 'user.update_privacy',
  input: privacyModeInput,
  run: ({ deps, user }, { privacyMode }) => updatePrivacy(deps, user.id, privacyMode),
  wire: {},
})
