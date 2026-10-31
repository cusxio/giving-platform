import { createServerFn } from '@tanstack/react-start'

import { logoutProcedure } from './session.server'

export const hasSession = createServerFn().handler(({ context }) => context.session !== null)

export const logout = createServerFn({ method: 'POST' }).handler(({ context }) =>
  logoutProcedure(context),
)
