import { createServerFn } from '@tanstack/react-start'

import type { UpdatePrivacyModeInput, UpdateUserInput } from './account.server'
import {
  getCurrentUserProcedure,
  getWelcomeProcedure,
  updatePrivacyModeProcedure,
  updateUserProcedure,
} from './account.server'

export const getCurrentUser = createServerFn().handler(({ context }) =>
  getCurrentUserProcedure(context),
)

export const getWelcome = createServerFn().handler(({ context }) => getWelcomeProcedure(context))

export const updateUser = createServerFn({ method: 'POST' })
  .validator((input: UpdateUserInput) => input)
  .handler(({ context, data }) => updateUserProcedure(context, data))

export const updatePrivacyMode = createServerFn({ method: 'POST' })
  .validator((input: UpdatePrivacyModeInput) => input)
  .handler(({ context, data }) => updatePrivacyModeProcedure(context, data))
