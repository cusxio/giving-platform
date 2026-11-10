import { createServerFn } from '@tanstack/react-start'

import { wireInput } from '#/core/wire'

import type { UpdatePrivacyModeInput, UpdateUserInput } from './account.server'
import {
  getCurrentUserAction,
  getWelcomeAction,
  updatePrivacyModeAction,
  updateUserAction,
} from './account.server'

export const getCurrentUser = createServerFn()
  .validator(wireInput<undefined>())
  .handler((ctx) => getCurrentUserAction(ctx))

export const getWelcome = createServerFn()
  .validator(wireInput<undefined>())
  .handler((ctx) => getWelcomeAction(ctx))

export const updateUser = createServerFn({ method: 'POST' })
  .validator(wireInput<UpdateUserInput>())
  .handler((ctx) => updateUserAction(ctx))

export const updatePrivacyMode = createServerFn({ method: 'POST' })
  .validator(wireInput<UpdatePrivacyModeInput>())
  .handler((ctx) => updatePrivacyModeAction(ctx))
