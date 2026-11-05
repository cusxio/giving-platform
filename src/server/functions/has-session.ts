import { createServerFn } from '@tanstack/react-start'

export const hasSession = createServerFn().handler(({ context }) => context.session !== null)
