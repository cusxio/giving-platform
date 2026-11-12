import type { getAnalytics, getEveryYear } from './analytics.functions'

export type Analytics = Awaited<ReturnType<typeof getAnalytics>>
export type EveryYear = Awaited<ReturnType<typeof getEveryYear>>
