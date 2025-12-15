import { createMiddleware } from '@tanstack/react-start'

import { PaymentService } from '#/features/giving/payment.service'

import { dbMiddleware } from './db-middleware'

export const paymentServiceMiddleware = createMiddleware()
  .middleware([dbMiddleware])
  .server(({ next, context }) => {
    const { db } = context
    const paymentService = new PaymentService(db)

    return next({ context: { paymentService } })
  })
