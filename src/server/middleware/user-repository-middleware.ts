import { createMiddleware } from '@tanstack/react-start'

import { UserRepository } from '#/features/user/user.repository'

import { dbMiddleware } from './db-middleware'

export const userRepositoryMiddleware = createMiddleware()
  .middleware([dbMiddleware])
  .server(({ next, context }) => {
    const { db } = context
    const userRepository = new UserRepository(db)
    return next({ context: { userRepository } })
  })
