-- Records drizzle/0000_baseline.sql as already applied, for a database whose tables existed before
-- migrations did (production). Run it once, and only after schema-fingerprint.sql gives the same
-- fingerprint on this database as on a new database migrated with `pnpm db:migrate`. The next
-- migrate then applies only the migrations after the baseline.

CREATE SCHEMA IF NOT EXISTS drizzle;

CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id serial PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);

INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
SELECT '7ec19767f5f2e2a305015e7cfef39db2766217e9397c2f250d8cf46cfe69d79a', 1794147700364
WHERE NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations);
