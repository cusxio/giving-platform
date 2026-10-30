import { createServerFn } from '@tanstack/react-start'

import { getCurrentUserProcedure, getWelcomeProcedure } from './account.server'

export const getCurrentUser = createServerFn().handler(({ context }) =>
  getCurrentUserProcedure(context),
)

export const getWelcome = createServerFn().handler(({ context }) => getWelcomeProcedure(context))
