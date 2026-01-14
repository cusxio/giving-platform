import { createStart } from '@tanstack/react-start'

import {
  loggingMiddleware,
  maintenanceMiddleware,
  sessionMiddleware,
} from './server/middleware'

export const startInstance = createStart(() => ({
  requestMiddleware: [
    maintenanceMiddleware,
    sessionMiddleware,
    loggingMiddleware,
  ],
}))
