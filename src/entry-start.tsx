import { createStart } from '@tanstack/react-start'

export const startInstance = createStart(async () => {
  if (!import.meta.env.SSR) {
    return {}
  }

  const { loggingMiddleware, maintenanceMiddleware, sessionMiddleware } =
    await import('./server/middleware')

  return {
    requestMiddleware: [
      maintenanceMiddleware,
      sessionMiddleware,
      loggingMiddleware,
    ],
  }
})
