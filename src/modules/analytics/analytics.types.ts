import type { getAnalytics } from './analytics.functions'

export type Analytics = Awaited<ReturnType<typeof getAnalytics>>
