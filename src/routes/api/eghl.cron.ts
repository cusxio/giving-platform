import { createFileRoute } from '@tanstack/react-router'

import { handleReconcile } from '#/modules/payments/server'

export const Route = createFileRoute('/api/eghl/cron')({
  server: { handlers: { GET: ({ request, context }) => handleReconcile(context.deps, request) } },
})
