import { isRedirect } from '@tanstack/react-router'
import { createMiddleware, createStart } from '@tanstack/react-start'

import { loggingMiddleware, sessionMiddleware } from './server/middleware'

// https://github.com/TanStack/router/issues/4460#issuecomment-3015836376
const convertRedirectErrorToExceptionMiddleware = createMiddleware({
  type: 'function',
}).server(async ({ next }) => {
  const result = await next()
  if ('error' in result && isRedirect(result.error)) {
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw result.error
  }
  return result
})

export const startInstance = createStart(() => ({
  functionMiddleware: [convertRedirectErrorToExceptionMiddleware],
  requestMiddleware: [sessionMiddleware, loggingMiddleware],
}))
