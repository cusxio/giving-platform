import { createFileRoute } from '@tanstack/react-router'

import { handleEghlCallback } from '#/modules/payments/server'

export const Route = createFileRoute('/api/eghl/callback')({
  server: {
    handlers: { POST: ({ request, context }) => handleEghlCallback(context.deps, request) },
  },
})
