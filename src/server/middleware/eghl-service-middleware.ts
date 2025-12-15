import { createMiddleware } from '@tanstack/react-start'

import { EghlService } from '#/features/payment-gateway/eghl.service'

export const eghlServiceMiddleware = createMiddleware().server(({ next }) => {
  const eghlService = new EghlService()
  return next({ context: { eghlService } })
})
