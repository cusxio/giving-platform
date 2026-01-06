import { neon, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'

import { DATABASE_URL } from '#/envvars'

// Required for PlanetScale Postgres connections
// https://planetscale.com/docs/postgres/connecting/neon-serverless-driver#using-http-mode
neonConfig.fetchEndpoint = (host) => `https://${host}/sql`

const client = neon(DATABASE_URL)
export const db = drizzle({ client, casing: 'snake_case' })

export type DB = typeof db
export type DBTransaction = Parameters<Parameters<DB['transaction']>[0]>[0]
