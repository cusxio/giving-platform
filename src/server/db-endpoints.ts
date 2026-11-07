/** Local development's Postgres sits behind a local Neon proxy on this host. */
export const LOCAL_DATABASE_HOST = 'db.localtest.me'

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
