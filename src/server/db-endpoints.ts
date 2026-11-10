import { neonConfig } from '@neondatabase/serverless'

/** Local development's Postgres sits behind a local Neon proxy on this host. */
const LOCAL_DATABASE_HOST = 'db.localtest.me'

const LOCAL_PROXY = `${LOCAL_DATABASE_HOST}:4444`

const isNeonHost = (host: string) => host.endsWith('.neon.tech')

/**
 * Neon hosts get the driver's own defaults, which send HTTP queries to the region's `api.` host.
 * PlanetScale Postgres needs its own host and the address in the websocket query string
 * (https://planetscale.com/docs/postgres/connecting/neon-serverless-driver).
 */
export function sqlEndpoint(host: string): string {
  if (host === LOCAL_DATABASE_HOST) {
    return `http://${LOCAL_PROXY}/sql`
  }
  return isNeonHost(host)
    ? `https://${host.replace(/^[^.]+\./u, 'api.')}/sql`
    : `https://${host}/sql`
}

export function websocketProxy(host: string, port: number | string): string {
  if (host === LOCAL_DATABASE_HOST) {
    return `${LOCAL_PROXY}/v1`
  }
  return isNeonHost(host) ? `${host}/v2` : `${host}/v2?address=${host}:${port}`
}

/**
 * Points Neon's serverless driver at the host in `databaseUrl`. The app and `scripts/migrate.ts`
 * both call it before they open a client, so they reach the database the same way.
 */
export function configureNeonDriver(databaseUrl: string): void {
  neonConfig.fetchEndpoint = sqlEndpoint
  // PlanetScale needs SCRAM-SHA-256, which rules out a pipelined connect.
  neonConfig.pipelineConnect = false
  neonConfig.useSecureWebSocket = new URL(databaseUrl).hostname !== LOCAL_DATABASE_HOST
  neonConfig.wsProxy = websocketProxy
}
