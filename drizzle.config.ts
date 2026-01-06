import { defineConfig } from 'drizzle-kit'

import { DATABASE_URL } from './src/envvars'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  dbCredentials: { url: DATABASE_URL },
  casing: 'snake_case',
})
