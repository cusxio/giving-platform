import { createStart } from '@tanstack/react-start'

import { loggingMiddleware, sessionMiddleware } from './server/middleware'

export const startInstance = createStart(() => ({
  requestMiddleware: [sessionMiddleware, loggingMiddleware],
}))
