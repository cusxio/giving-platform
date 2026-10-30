import { defineConfig } from 'drizzle-kit'

import { DATABASE_URL } from './src/server/env.server'

export default defineConfig({
  casing: 'snake_case',
  dbCredentials: { url: DATABASE_URL },
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
})
