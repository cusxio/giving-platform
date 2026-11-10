import { createFileRoute } from '@tanstack/react-router'

import { handleCleanup } from '#/modules/auth/server'

export const Route = createFileRoute('/api/auth/cron')({
  server: { handlers: { GET: ({ request, context }) => handleCleanup(context.deps, request) } },
})
