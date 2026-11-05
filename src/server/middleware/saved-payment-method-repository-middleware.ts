import { createMiddleware } from '@tanstack/react-start'

import { SavedPaymentMethodRepository } from '#/features/giving/saved-payment-method.repository'

import { dbMiddleware } from './db-middleware'

export const savedPaymentMethodRepositoryMiddleware = createMiddleware()
  .middleware([dbMiddleware])
  .server(({ next, context }) => {
    const { db } = context
    const savedPaymentMethodRepository = new SavedPaymentMethodRepository(db)
    return next({ context: { savedPaymentMethodRepository } })
  })
