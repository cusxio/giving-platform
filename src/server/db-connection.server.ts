import { Pool, neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { drizzle as drizzlePool } from 'drizzle-orm/neon-serverless'

import { DATABASE_URL } from '#/server/env.server'

import { configureNeonDriver } from './db-endpoints'

// Neon's serverless driver, connecting to PlanetScale Postgres, Neon or the local proxy.
configureNeonDriver(DATABASE_URL)

const pool = new Pool({ connectionString: DATABASE_URL })
export const dbPool = drizzlePool({ casing: 'snake_case', client: pool })

export type DBPool = typeof dbPool
export type DBPoolTransaction = Parameters<Parameters<DBPool['transaction']>[0]>[0]

const client = neon(DATABASE_URL)
export const db = drizzle({ casing: 'snake_case', client })

export type DB = typeof db
