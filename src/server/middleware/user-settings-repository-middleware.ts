import { createMiddleware } from '@tanstack/react-start'

import { UserSettingsRepository } from '#/features/user/user-settings.repository'

import { dbMiddleware } from './db-middleware'

export const userSettingsRepositoryMiddleware = createMiddleware()
  .middleware([dbMiddleware])
  .server(({ next, context }) => {
    const { db } = context
    const userSettingsRepository = new UserSettingsRepository(db)
    return next({ context: { userSettingsRepository } })
  })
