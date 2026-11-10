# Collective giving platform

The donation site for Collective Central. Donors give to a fund (Offering, Tithe, Mission or Future), pay through the eGHL payment gateway, and sign in with an emailed code to see their history and receipts.

It is a TanStack Start app on Vite and React, deployed to Vercel. It reads and writes Postgres through Drizzle ORM and Neon's serverless driver: PlanetScale Postgres in production, Neon for the demo, and a local Postgres in development.

To change the code, read [AGENTS.md](AGENTS.md) first. It covers where each kind of file goes, how errors and payments work, and how to change the database.

## Run it locally

You need [mise](https://mise.jdx.dev) and Docker.

1. Install Node and pnpm at the versions in `mise.toml`, then the dependencies:

   ```bash
   mise install
   pnpm install
   ```

   mise also puts `node_modules/.bin` on your `PATH`, so `moon`, `vitest` and the other tools run by name.

2. Start Postgres and the local Neon proxy. The app talks to Postgres through Neon's serverless driver, so it needs the proxy even locally. Pick any password and use it in both commands:

   ```bash
   docker network create giving-platform-net
   ```

   ```bash
   docker run -d --name giving-platform-pg --restart unless-stopped \
   	--network giving-platform-net -p 127.0.0.1:5432:5432 \
   	-e POSTGRES_PASSWORD=<password> -e POSTGRES_DB=giving_platform \
   	-v giving-platform-pgdata:/var/lib/postgresql postgres:18-alpine
   ```

   ```bash
   docker run -d --name giving-platform-neon-proxy --restart unless-stopped \
   	--network giving-platform-net -p 127.0.0.1:4444:4444 -e APP_ENV=development \
   	-e PG_CONNECTION_STRING=postgres://postgres:<password>@giving-platform-pg:5432/giving_platform \
   	ghcr.io/timowilhelm/local-neon-http-proxy:main
   ```

   If the proxy starts before Postgres is ready, its log shows `Control plane request failed`. Run `docker restart giving-platform-neon-proxy`.

3. Copy the settings file and fill it in:

   ```bash
   cp mise.local.toml.example mise.local.toml
   ```

   Use the same password in `DATABASE_URL`. Its host, `db.localtest.me`, resolves to `127.0.0.1` through public DNS. If your router blocks that answer (DNS rebinding protection), add `127.0.0.1 db.localtest.me` to `/etc/hosts`.

4. Create the tables and the four funds:

   ```bash
   pnpm db:migrate
   ```

5. Start the app:

   ```bash
   pnpm dev
   ```

   It runs at http://localhost:3003. Without an email key, sign-in codes go to a test inbox. The dev server logs `Test email sent` with a link to read each one.

## Commands

| Command                      | What it does                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `pnpm dev`                   | Starts the dev server on port 3003.                                             |
| `pnpm build`                 | Builds the app, then migrates the database when `MIGRATE_ON_BUILD` is `true`.   |
| `pnpm db:generate`           | Writes a migration in `drizzle/` from changes to `src/server/schema.server.ts`. |
| `pnpm db:migrate`            | Applies the migrations the database in `DATABASE_URL` has not run.              |
| `pnpm dev:email`             | Previews the sign-in emails in the browser.                                     |
| `moon run :test`             | Runs the tests. `pnpm test:watch` reruns them on each change.                   |
| `moon run :lint`             | Runs oxlint, including the project's own rules.                                 |
| `moon run :typecheck`        | Runs `tsc`.                                                                     |
| `moon run :fix`              | Applies lint fixes and formats the code with oxfmt.                             |
| `moon run :knip`             | Finds unused files, exports and dependencies.                                   |
| `moon run :migrations-check` | Fails when the schema changed without a migration.                              |

CI runs `moon ci :lint :format-check :typecheck :test :knip :migrations-check`. The pre-commit hook lints and format-checks the staged files, and commit messages follow [Conventional Commits](https://www.conventionalcommits.org).

`pnpm build` is the only check that catches server code reaching the browser bundle. Set `BUNDLE_STATS=true` to also write `bundle-stats.html`.

## Settings

`src/server/env-rules.ts` checks these when the server starts. It refuses to start and names every setting that is missing or malformed.

| Setting                                        | Needed                    | Purpose                                                                                                                                    |
| ---------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`                                     | Always                    | `development` or `production`. Vercel sets `production`.                                                                                   |
| `SESSION_SECRET`                               | Always                    | Keys the hash that stores login codes and session tokens. 32 characters or more in production.                                             |
| `DATABASE_URL`                                 | Always                    | The Postgres connection string.                                                                                                            |
| `EGHL_SERVICE_ID`, `EGHL_URL`, `EGHL_PASSWORD` | Always                    | The eGHL merchant account and payment endpoint.                                                                                            |
| `OTEL_TRACES_EXPORTER`, `OTEL_LOGS_EXPORTER`   | Always                    | `otlp`, `console` or `none`, or a comma-separated mix. `otlp` also reads `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS`.   |
| `MAILERSEND_API_KEY` or `BREVO_API_KEY`        | Exactly one in production | The key that is set picks the email provider. With neither, development sends to a test inbox. No environment may set both.                |
| `CRON_SECRET`                                  | Production                | The Bearer token Vercel sends to the crons. Without it, the crons refuse every call.                                                       |
| `MAIL_ROOT_DOMAIN`                             | Optional                  | The sender's domain. Without it, emails come from the brand addresses in `src/core/brand/config.ts`.                                       |
| `BASE_URL`                                     | Optional                  | Where eGHL sends the payer back. On Vercel it defaults to the production domain or the preview's branch address, and locally to port 3003. |
| `OTEL_LOG_LEVEL`                               | Optional                  | OpenTelemetry's own diagnostic logging, such as `NONE` or `DEBUG`.                                                                         |
| `MAINTENANCE_MODE`                             | Optional                  | `true` shows the maintenance page on every route.                                                                                          |
| `MIGRATE_ON_BUILD`                             | Optional, build only      | `true` makes `pnpm build` migrate the database. See "Database changes" in AGENTS.md before you set it.                                     |

## Deploys

Vercel builds every push through its Git integration and runs `pnpm build`. A push to `main` deploys production, and any other branch gets a preview. Keep the project's Build Command at its default, and keep **Automatically expose System Environment Variables** on. The return address and the migration step both read Vercel's system variables.

`vercel.json` runs the functions in Singapore (`sin1`) and declares two schedules:

- `eghl-reconcile` calls `/api/eghl/cron` every 20 minutes. It asks eGHL about payments still pending.
- `auth-cleanup` calls `/api/auth/cron` daily at 19:00 UTC. It deletes used and expired login codes and old rate-limit rows.

For a payment to complete on a preview, turn off Vercel Authentication for previews. Otherwise Vercel's login check drops eGHL's reply, and the payer lands on `/uh-oh`.
