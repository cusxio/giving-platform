import { createMiddleware } from '@tanstack/react-start'

import { ContributionService } from '#/features/giving/contribution.service'
import { UserRepository } from '#/features/user/user.repository'

import { dbMiddleware } from './db-middleware'

export const contributionServiceMiddleware = createMiddleware()
  .middleware([dbMiddleware])
  .server(({ next, context }) => {
    const { db } = context
    const userRepository = new UserRepository(db)
    const contributionService = new ContributionService(db, userRepository)

    return next({ context: { contributionService } })
  })
