import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

export const startInstance = createStart(async () => {
  if (!import.meta.env.SSR) {
    return {}
  }

  const [{ maintenanceMiddleware }, { requestContext }] = await Promise.all([
    import('./server/middleware/maintenance-middleware'),
    import('./server/request-context.server'),
  ])

  const csrfMiddleware = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' })

  return { requestMiddleware: [csrfMiddleware, maintenanceMiddleware, requestContext] }
})
