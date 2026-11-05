import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

export const startInstance = createStart(async () => {
  if (!import.meta.env.SSR) {
    return {}
  }

  const [{ loggingMiddleware }, { maintenanceMiddleware }, { sessionMiddleware }] =
    await Promise.all([
      import('./server/middleware/logging-middleware'),
      import('./server/middleware/maintenance-middleware'),
      import('./server/middleware/session-middleware'),
    ])

  const csrfMiddleware = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' })

  return {
    requestMiddleware: [
      csrfMiddleware,
      maintenanceMiddleware,
      sessionMiddleware,
      loggingMiddleware,
    ],
  }
})
