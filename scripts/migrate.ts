// Applies the migrations in drizzle/ that the database has not run, all in one transaction.
//
//   node scripts/migrate.ts           migrate the database in DATABASE_URL
//   node scripts/migrate.ts --build   the same, only when MIGRATE_ON_BUILD is true (the build step)
//
// It records each migration in drizzle.__drizzle_migrations, the table drizzle-kit reads, so a
// second run applies nothing. drizzle-orm's own migrate() reads that table before it opens its
// transaction, so two builds could both apply a migration. This reads and applies under one
// transaction-scoped lock instead, which also holds through a transaction-mode pooler.
import { readFileSync } from 'node:fs'

import { Pool } from '@neondatabase/serverless'
import { sql } from 'drizzle-orm'
import type { MigrationMeta } from 'drizzle-orm/migrator'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { drizzle } from 'drizzle-orm/neon-serverless'

import { configureNeonDriver } from '../src/server/db-endpoints.ts'

const MIGRATIONS_FOLDER = 'drizzle'
const MIGRATION_LOCK = 'giving-platform:migrate'
const PRODUCTION_BRANCH = 'main'
// How long a statement waits for a table lock. While a migration waits, every app query on that
// table queues behind it, so it gives up and fails the deploy instead of stalling the site.
const LOCK_TIMEOUT = '5s'

const isBuild = process.argv.includes('--build')
if (isBuild && process.env.MIGRATE_ON_BUILD !== 'true') {
  console.log('Skipped migrations: MIGRATE_ON_BUILD is not true in this environment.')
  process.exit(0)
}

const databaseUrl = process.env.DATABASE_URL
if (databaseUrl === undefined || databaseUrl === '') {
  console.error('DATABASE_URL is required to migrate.')
  process.exit(1)
}

// A preview has its own database, so it migrates from any branch. Any other build migrates only
// from main: promoting a preview rebuilds it with production's settings, which would apply an
// unmerged branch's migrations to the production database. A build that can't tell its
// environment or branch counts as production.
const builtBranch = process.env.VERCEL_GIT_COMMIT_REF
const mayMigrateFromBranch =
  !isBuild || process.env.VERCEL_ENV === 'preview' || builtBranch === PRODUCTION_BRANCH

const journal = JSON.parse(readFileSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`, 'utf8')) as {
  entries: { tag: string; when: number }[]
}
const tagOf = new Map(journal.entries.map((entry) => [entry.when, entry.tag]))
const tag = (migration: MigrationMeta) =>
  tagOf.get(migration.folderMillis) ?? String(migration.folderMillis)
const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER })

configureNeonDriver(databaseUrl)
const pool = new Pool({ connectionString: databaseUrl })
const db = drizzle({ client: pool })

try {
  const applied = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${MIGRATION_LOCK}))`)
    await tx.execute(sql.raw(`set local lock_timeout = '${LOCK_TIMEOUT}'`))
    await tx.execute(sql`create schema if not exists drizzle`)
    await tx.execute(sql`
      create table if not exists drizzle.__drizzle_migrations (
        id serial primary key,
        hash text not null,
        created_at bigint
      )
    `)

    const history = await tx.execute<{ created_at: string; hash: string }>(
      sql`select hash, created_at from drizzle.__drizzle_migrations`,
    )
    const recorded = new Map(history.rows.map((row) => [Number(row.created_at), row.hash]))
    const lastApplied = recorded.size === 0 ? undefined : Math.max(...recorded.keys())

    if (lastApplied === undefined) {
      const tables = await tx.execute<{ found: boolean }>(
        sql`select to_regclass('public.transactions') is not null as found`,
      )
      if (tables.rows[0]?.found === true) {
        throw new Error(
          'The database has tables but no migration history. Record the baseline first: see ' +
            '"Database changes" in AGENTS.md.',
        )
      }
    }

    const isPending = (migration: MigrationMeta) =>
      lastApplied === undefined || migration.folderMillis > lastApplied
    for (const migration of migrations.filter((candidate) => !isPending(candidate))) {
      const hash = recorded.get(migration.folderMillis)
      if (hash === undefined) {
        throw new Error(
          `${tag(migration)} is older than the database's last migration but never ran. ` +
            'Regenerate it so it sorts after the migrations already applied.',
        )
      }
      if (hash !== migration.hash) {
        throw new Error(`${tag(migration)} changed after it ran. Add a new migration instead.`)
      }
    }

    const pending = migrations.filter((migration) => isPending(migration))
    if (pending.length > 0 && !mayMigrateFromBranch) {
      throw new Error(
        `This build is from ${builtBranch ?? 'an unknown branch'}, not ${PRODUCTION_BRANCH}, and ` +
          'has migrations to apply. Merge the branch and deploy from main. A build needs ' +
          "Vercel's system environment variables to know its branch.",
      )
    }

    for (const migration of pending) {
      try {
        for (const statement of migration.sql) {
          await tx.execute(sql.raw(statement))
        }
      } catch (error) {
        throw new Error(`Migration ${tag(migration)} failed.`, { cause: error })
      }
      await tx.execute(
        sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${migration.hash}, ${migration.folderMillis})`,
      )
    }
    return pending.map((migration) => tag(migration))
  })
  console.log(applied.length === 0 ? 'Database is up to date.' : `Applied ${applied.join(', ')}.`)
} finally {
  await pool.end()
}
