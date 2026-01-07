import { createMiddleware } from '@tanstack/react-start'

import { ContributionService } from '#/features/giving/contribution.service'
import { UserRepository } from '#/features/user/user.repository'

import { dbMiddleware } from './db-middleware'

export const contributionServiceMiddleware = createMiddleware()
  .middleware([dbMiddleware])
  .server(({ next, context }) => {
    const { db, dbPool } = context
    const userRepository = new UserRepository(db)
    const contributionService = new ContributionService(dbPool, userRepository)

    return next({ context: { contributionService } })
  })
