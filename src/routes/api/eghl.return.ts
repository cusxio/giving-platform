import { createFileRoute } from '@tanstack/react-router'

import { handleEghlReturnGet, handleEghlReturnPost } from '#/modules/payments/server'

export const Route = createFileRoute('/api/eghl/return')({
  server: {
    handlers: {
      GET: ({ request, context }) => handleEghlReturnGet(context.deps, request),
      POST: ({ request, context }) => handleEghlReturnPost(context.deps, request),
    },
  },
})
