import { defineConfig } from 'drizzle-kit'

import { DATABASE_AUTH_TOKEN, DATABASE_URL } from './src/envvars'

export default defineConfig({
  dialect: 'turso',
  schema: './src/db/schema.ts',
  dbCredentials: { url: DATABASE_URL, authToken: DATABASE_AUTH_TOKEN },
  casing: 'snake_case',
})
