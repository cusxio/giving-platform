import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'

import { DATABASE_AUTH_TOKEN, DATABASE_URL } from '#/envvars'

const client = createClient({
  authToken: DATABASE_AUTH_TOKEN,
  url: DATABASE_URL,
})
export const db = drizzle(client, { casing: 'snake_case' })

export type DB = typeof db
export type DBTransaction = Parameters<Parameters<DB['transaction']>[0]>[0]
