import { createServerFn } from '@tanstack/react-start'

export const getSession = createServerFn().handler(({ context }) => context.session)
