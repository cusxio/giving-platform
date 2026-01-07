/* eslint-disable perfectionist/sort-modules */
import { neon, neonConfig, Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { drizzle as drizzlePool } from 'drizzle-orm/neon-serverless'

import { DATABASE_URL } from '#/envvars'

// Required for PlanetScale Postgres connections
// https://planetscale.com/docs/postgres/connecting/neon-serverless-driver

// http
const DATABASE_LOCAL_URL = 'db.localtest.me'
neonConfig.fetchEndpoint = (host) => {
  if (host === DATABASE_LOCAL_URL) {
    const protocol = 'http'
    const port = 4444
    return `${protocol}://${host}:${port}/sql`
  }

  return `https://${host}/sql`
}

// ws
neonConfig.pipelineConnect = false
neonConfig.useSecureWebSocket =
  new URL(DATABASE_URL).hostname !== DATABASE_LOCAL_URL
neonConfig.wsProxy = (host) => {
  if (host === DATABASE_LOCAL_URL) {
    const port = 4444
    return `${host}:${port}/v1`
  }
  return `${host}/v2`
}

const pool = new Pool({ connectionString: DATABASE_URL })
export const dbPool = drizzlePool({ client: pool, casing: 'snake_case' })

export type DBPool = typeof dbPool
export type DBPoolTransaction = Parameters<
  Parameters<DBPool['transaction']>[0]
>[0]

const client = neon(DATABASE_URL)
export const db = drizzle({ client, casing: 'snake_case' })

export type DB = typeof db
export type DBTransaction = Parameters<Parameters<DB['transaction']>[0]>[0]

export type AnyDB = DB | DBPool
export type AnyDBOrTransaction = AnyDB | AnyDBTransaction
export type AnyDBTransaction = DBPoolTransaction | DBTransaction
