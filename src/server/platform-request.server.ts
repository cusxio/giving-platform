/** The incoming request as Nitro's Vercel runtime hands it over, with the platform's `waitUntil`. */
export type PlatformRequest = Request & { waitUntil?: (promise: Promise<unknown>) => void }
