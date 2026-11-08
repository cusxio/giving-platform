import { defineConfig } from 'drizzle-kit'

// `drizzle-kit generate` reads only the schema, so CI can run it with no database. Commands that
// connect, such as `studio`, read DATABASE_URL from the environment.
export default defineConfig({
  casing: 'snake_case',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  dialect: 'postgresql',
  out: './drizzle',
  schema: './src/server/schema.server.ts',
})
