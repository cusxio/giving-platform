# Agent guide

To add a feature, copy the nearest module in `src/modules/`. Lint (`oxlint.config.ts` and `lint/`) enforces the import rules below, and each lint message names the fix. Where this guide is stricter than lint, follow the guide. [README.md](README.md) covers setup, commands and settings.

## Where each kind of file lives

| File                                           | Holds                                                                                                                       | May import                                                                                                                                                     |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/<m>/index.ts`                     | The client entry: query options, mutation hooks, client-safe types.                                                         | Its module's client files, types from its `*.server.ts` files, and `src/core/`.                                                                                |
| `src/modules/<m>/server.ts`                    | The server entry: what other modules and `src/server/` may use.                                                             | Any file in its module.                                                                                                                                        |
| `src/modules/<m>/<m>.functions.ts`             | `createServerFn` exports, each one line: `.validator(wireInput<T>()).handler((ctx) => xAction(ctx))`.                       | The `*Action` exports and `*Input` types of `*.server.ts`, never a repository.                                                                                 |
| `src/modules/<m>/<m>.queries.ts`               | `queryOptions`, query keys, and mutation hooks.                                                                             | `*.functions.ts`, `*.types.ts`, pure files, and types from `*.server.ts` and `src/server/`.                                                                    |
| `src/modules/<m>/<m>.types.ts`                 | Client-safe types, read from the server functions' return types. `auth` has none: its workflows export the response types.  | `*.functions.ts`.                                                                                                                                              |
| `src/modules/<m>/<m>.errors.ts`                | Domain errors: `TaggedError` classes, one per outcome a caller handles differently.                                         | `better-result`.                                                                                                                                               |
| `src/modules/<m>/<thing>.ts`                   | Pure domain code that runs on the client and the server. It declares the row shapes it reads.                               | Other pure code.                                                                                                                                               |
| `src/modules/<m>/<use-case>.server.ts`         | Workflows `(deps: Pick<Deps, ...>, ...args) => Promise<Result>` and the actions the server functions call.                  | Any file in its module, other modules' `server.ts`, `src/core/`, and `src/server/` except env, the root logger, the neon clients, the schema and `sql.server`. |
| `src/modules/<m>/<table>.repository.server.ts` | `defineQuery(...)` factories. The only module files that import `drizzle-orm` or the schema.                                | `drizzle-orm`, `#/server/schema.server`, `#/server/sql.server`, `#/server/db.server`, `src/core/`.                                                             |
| `src/server/`                                  | Platform code: the db port and runner, policies, input parsing, env, logger, mailer, crypto, crons, telemetry, `deps`.      | Anything, but other modules only through their entries.                                                                                                        |
| `src/server/testing/`                          | Test helpers: `createFakeDb`, `createDriverDb`, `testDeps`, `testContext`, `okValue`, `errValue`, `recordingLogger`.        | Anything, but other modules only through their entries.                                                                                                        |
| `src/core/`                                    | Isomorphic code: brand, dates, money, formatters, transaction statuses, wire envelope types.                                | No server code.                                                                                                                                                |
| `src/routes/`                                  | File routes plus route-local `-components/` and `-hooks/`. `routes/api/` routes are one-line bindings to a module's server. | Client entries, `src/components/`, `src/hooks/`, `src/core/`. Only `routes/api/` may use `#/modules/<m>/server`.                                               |
| `src/components/`, `src/hooks/`                | Shared UI and client hooks.                                                                                                 | Client entries and `src/core/`. No server code.                                                                                                                |
| `src/entry-*.tsx`, `src/router.tsx`            | App entries.                                                                                                                | Client code. Only `entry-server.tsx`, and `entry-start.tsx` behind `import.meta.env.SSR`, may import `src/server/`.                                            |

## Module rules

- Import another module only through `#/modules/<m>` (client) or `#/modules/<m>/server` (server).
- Modules are flat. Import siblings with `./`. A subfolder, such as `auth/emails/`, holds only leaf files that never import with `../`.
- A `*.server.ts` file never reaches the browser. `pnpm build` fails with `Import denied in client environment` when client code imports one. CI doesn't build, so run `pnpm build` after you move an import between client and server code.
- SQL lives only in `*.repository.server.ts`. The module that owns a table is its only writer. `history` and `analytics` read other modules' tables and write nothing.
- Workflows get infrastructure from `deps`. Only `src/server/` reads env, and `src/server/env-rules.ts` checks it at startup.
- Name a `defineQuery` `<module>.<factory name>`, such as `history.transactionItemsOf`.

## Errors

Every failure is one of three kinds.

- A domain error is a `TaggedError` from `<m>.errors.ts`, returned as `Result.err`. It names what happened, never how the client sees it.
- `InfraError` (`src/server/infra-error.ts`) is any database, mailer or decoder failure. `op` names the failing query or label. Workflows pass it up unchanged and never map it to a domain error. `required(row, op)` turns a missing `RETURNING` row into one. Wrap a call that throws, such as `deps.mailer.send`, as `Result.tryPromise({ try, catch: (cause) => infra('mailer.send', cause) })`.
- A defect is any throw, including the `Panic` that `Result.gen` makes of a throw or a rejected await inside it. Nothing catches a defect and turns it into an `Err`.

The `Db` port returns `Result`. `deps.db.run(query)`, `deps.db.batch([...])` and `deps.db.transaction(work)` answer `Err(InfraError)` instead of throwing. A transaction rolls back when `work` returns `Err`, and returns that `Err`. A throw from `work` rolls back and rethrows.

Write a workflow with several steps as `Result.gen`, and `yield* Result.await(...)` each step. A one-step workflow chains `andThen` or `map` on the awaited `Result`. Never throw a `redirect` or `notFound` from a workflow, because inside `Result.gen` it becomes a `Panic` and a 500. Return a domain error and answer it in the action's `wire` table.

## Procedures

`src/server/procedure.server.ts` is the runner. It has two front doors with one runtime: policy, parse, run, settle.

- `defineMutation` answers an envelope: `SUCCESS`, a `BUSINESS_ERROR` per `business(...)` row, `AUTH_ERROR` when the policy refuses, `VALIDATION_ERROR` for bad input, and `SERVER_ERROR` for an `InfraError`.
- `defineRead` answers the bare value. A refused policy redirects to login, or calls `notFound()` when forbidden. Bad input or an `InfraError` throws a generic error, so no driver message reaches the browser. Its rows are `toNotFound()` or `returning(value)`.

An action's spec has `auth`, `event`, `input`, `run` and `wire`. `wire` has exactly one row per domain error that `run` can return, and tsc names a missing or extra row. `<m>.types.ts` reads the wire type with `Awaited<ReturnType<typeof fn>>`.

- Policies (`src/server/authorize.server.ts`) are `anyone`, `anonymousOnly` (a signed-in caller is redirected home), `requireUser` and `requireSu`. The workflow gets the policy's narrowed context, so `user` is non-null under `requireUser`.
- Input is `parseWith(Compile(schema), { trim, lowercase, convert })`, or `noInput`. The client's input type is `Parsed<typeof parser>`, exported as `<Name>Input`. Give a string input `maxLength` when it reaches a sized column. `parseWith` drops every key the schema doesn't declare. Still pass a repository write only the columns it may change, never a client-shaped object.

## Login codes

- A code is six digits, stored in `tokens` only as its HMAC (`deps.hashToken`), and live for `CODE_LIFETIME_MINUTES`. It belongs to one mode: a signup code never signs in, and a login code never activates a guest.
- Issue a code only through the `issueCode` batch in `request-otp.server.ts`. Reissuing the same digits refreshes the live row, which keeps its id and its check count.
- `verify-otp.server.ts` rate-limits the attempt (`checkOtpVerify`). Then `checkCodes` counts one check against every live code of the mode before it compares any, so each issue of a code faces at most five guesses.
- `claimTokenIfUnused` is a compare-and-set, so a code signs in once. A wrong, missing, expired, spent or other-mode code answers `INVALID_OR_EXPIRED_OTP`. Only the `reason` in the log differs.
- The login path deletes no other user's rows. `/api/auth/cron` (`cleanup.server.ts`) deletes claimed and expired codes and old `rate_limit_attempts` rows once a day.

Both crons are schedules in `vercel.json`. Each checks `CRON_SECRET` through `isCronRequest` in `src/server/cron.server.ts`.

## Payment gateway

- `payments/gateway.ts` is the port. `deps.eghl` takes and returns only the domain types of `payments/payment-outcome.ts`, with amounts in cents.
- eGHL wire fields (PascalCase) stay in the `eghl.*` files.
  - `eghl.wire.ts` holds the reply schemas and status enums.
  - `eghl.outcome.ts` maps a `Verified` reply or answer to a domain value, and is pure.
  - `eghl.gateway.server.ts` signs, sends and verifies.
- Outside those files, only the repositories' length pins (`paymentTextFitsColumns`, `cardFieldsFitColumns`) name wire fields. Handlers and the cron never import `eghl.wire.ts`. `gateway.types.test.ts` fails tsc when a PascalCase key reaches the port.
- Only the gateway marks a value `Verified`. A reply qualifies once its signature matches. A query answer must also name the queried PaymentID and Amount.
- A signed reply never fails settlement over a field's length. `eghl.outcome.ts` cuts or drops the field, and the gateway logs `payment.fields_clipped` with the field names, never their values.
- A query answer of refunded or reversed is the `refunded` outcome. A busy gateway is `Err(EghlGatewayBusyError)` from `queryStatus`, not an outcome.
- The request signs `PageTimeout` from `PAGE_TIMEOUT_MINUTES`. A test keeps it shorter than the cron's `RECONCILE_MIN_AGE_MINUTES` and `EXPIRE_AFTER_MINUTES`, so the cron never touches a row whose donor can still pay.

## Transaction status

`src/core/transaction-status.ts` owns the statuses, the `TRANSITIONS` table, `sourcesOf` (its inverse), and the history and analytics facets. To add a status, add it there. tsc then lists every place that needs an entry.

- `cancelled` is a payment page the donor left unpaid. A cancel and a page timeout send the same reply, so the receipt must not say the donor chose to leave.
- `held` is a gateway success for other money than the row's, or under a `TxnID` the transaction already recorded. A refund whose total is not the whole sale is held too. An operator resolves it at eGHL. History doesn't list it and totals don't count it.
- `refunded` is a payment eGHL took and returned before the platform recorded it. It is reached only from `pending` and runs no card step. A refund made at eGHL to a `success` row is not synced, so the row stays `success` and keeps counting.

Only a signed success reply, from the callback or a return, moves a `failed` or `cancelled` row. It moves to `success`, or to `held` when the money differs or its `TxnID` is already recorded. The cron and the confirming query touch only `pending` rows. A late success logs `payment.finalize.late_success`, through `logAlert` when it contradicts a failure eGHL reported under another `TxnID`.

Never move a `success` row to `failed` by hand. Refund at eGHL and leave the row as it is. eGHL's replies carry no nonce, so a donor can replay their success reply, and it would land on the hand-failed row as a conflict.

## Recording an outcome

`payments/record-outcome.server.ts` is the only writer of `transactions.status`. Inside one `db.transaction`:

1. `lockTransaction` locks the row (`SELECT ... FOR UPDATE`).
2. `findProviderTxnIds` reads the `TxnID` of each of its payments rows.
3. The pure `planTransition(stored, outcome)` decides the move.
4. `moveTransaction(transition)` writes it.
5. The writer inserts the payments row and runs the card step. Guests save no card.

`planTransition` alone builds a `Transition`, and the WHERE of `moveTransaction` lists `sourcesOf(to)`, so the database refuses what the table refuses. A compare-and-set that finds no row, or a stored status outside the tuple, is an `InfraError`. A hold writes no payments row, runs no card step, and logs `payment.finalize.conflict`, `.currency_mismatch`, `.amount_mismatch` or `.refund_mismatch` through `logAlert`.

Every channel settles through `payments/settlement.server.ts`. The callback and both returns call `settleReply`, and the cron calls `settlePolled` for each pending row. The pure `decide(outcome, context)` in `payment-outcome.ts` says what an answer means for the row. Change what an answer means in `decide`, never in a handler or the cron.

The cron claims up to 25 `pending` rows created `RECONCILE_MIN_AGE_MINUTES` to `RECONCILE_WINDOW_DAYS` ago, least recently checked first. It stamps their `updated_at` before it queries eGHL, so a pending row's `updated_at` is the cron's last claim, not its last status change. Its summary, `eghl.cron.complete`, counts the older pending rows in `stale_pending` for an operator to resolve at eGHL.

## Logs and traces

- The runner logs each outcome once: the row's own `event`, `<event>.unauthorized`, `<event>.redirected`, `<event>.validation_failed` (with `issues`), `<event>.failed` for an `InfraError`, and `<event>.defect` for a throw.
- A failure log carries `error.type` (the class, or a SQLSTATE or system code when the class is generic), `op`, and `err` with the class, code and SQL text, but no query parameters or database messages. Never log a raw driver error yourself. Use `logInfraFailure` or `logInfraEvent`.
- A `SERVER_ERROR` envelope is an HTTP 200, so `<event>.failed` and `<event>.defect` also mark the request span `ERROR` and record the exception. Healthy spans stay `UNSET`.
- An event someone must act on while the response stays healthy, such as a held payment, goes through `logAlert`. It logs at `error` and marks the request span `ERROR` with the event as `error.type`.
- An HTTP route that is not a server function wraps its handler in `logDefects(logger, event, handler)`, so a defect is logged once and rethrown.

## Tests

- Test pure files directly, with plain rows and no fakes.
- Test a workflow by calling it with `createFakeDb()` and `testDeps(overrides)`, and read its `Result` with `okValue` or `errValue`. Don't mock env in a workflow test.
- Test an action by calling it with `{ context: testContext(user, deps), data }`. Assert the wire answer and the log lines from `recordingLogger()`.
- `createFakeDb().on(factory, impl)` answers a query. An `impl` that throws is `Err(InfraError)`.
- Assert `db.roundTrips` for every workflow that batches, so a lost `db.batch` fails a test.
- Pin exact SQL with `createDriverDb` when the statement's text matters, such as an `ORDER BY`.

## Database changes

`src/server/schema.server.ts` is the schema. `drizzle/` holds the migrations that build it, applied in order and recorded in `drizzle.__drizzle_migrations`. Migrating sets a database up: `0000_baseline` creates the tables and `0001_seed_funds` adds the four funds.

- **Change the schema.** Edit `schema.server.ts`, run `pnpm db:generate`, read the SQL it writes, and commit `drizzle/` with the change. Never edit a migration that has shipped. Add a new one.
- **Change data.** Run `pnpm drizzle-kit generate --custom --name <what>` and write the SQL. It runs once on every database, so it must also be correct on a new, empty one.
- **Migrate.** `pnpm db:migrate` applies what the database in `DATABASE_URL` has not run, in one transaction and under a lock. `pnpm build` runs it when `MIGRATE_ON_BUILD` is `true`. Set that variable only in a Vercel environment with its own database: Production, and Preview only when each preview gets its own database branch. A failed migration fails the deploy, and the live site keeps running.
- **What migrate refuses.** Each refusal fails the deploy and names the migration.
  - A statement that waits more than 5 seconds for a table lock, since every app query on that table waits behind it. Deploy again when traffic is lower, or split the migration. Locks that earlier statements took stay held until the whole run commits, so keep a data migration small.
  - A production build from a branch other than `main` with migrations to apply. Promoting a preview rebuilds it with production's settings, which would apply its unmerged migrations to the production database. A build without Vercel's system environment variables counts as production.
  - A migration older than the last one applied that never ran, such as one from a branch that merged late. Regenerate it.
  - A migration whose file changed after it ran.
- **Stay compatible with the running code.** A migration runs before its deploy goes live, and an instant rollback runs old code on the new schema without undoing the migration. So every migration must work with the code before it and the code after it.
  - **Safe in one deploy:** a new table, a nullable column, or a column whose default is a constant.
  - **Removing a column takes two deploys.** Drizzle names every schema column in its queries, so the code stops using a column only when it leaves `schema.server.ts`.
    1. Remove the column from the schema and run `pnpm db:generate`. Delete the `DROP COLUMN` statement from the generated SQL, and keep the rest and the snapshot. If the column is `NOT NULL` with no default, drop `NOT NULL` instead, so the new code's inserts succeed.
    2. In a later deploy, drop the column with `pnpm drizzle-kit generate --custom --name drop_<column>`.
  - **Renaming a column takes three deploys.** Add the new column and write to both, then read from the new one, then drop the old one as above. Never accept drizzle-kit's rename prompt. Its `RENAME COLUMN` breaks the running code.
  - **A new constraint on a large table** goes in as `NOT VALID`, then `VALIDATE CONSTRAINT` in a later migration, so the check doesn't lock the table. That works for a foreign key or a `CHECK`. For `NOT NULL` before Postgres 18, add `CHECK (<column> IS NOT NULL) NOT VALID`, validate it, then `SET NOT NULL`.
  - **An index on a large table** needs a manual step, because migrations run in a transaction and can't use `CREATE INDEX CONCURRENTLY`. Create the index by hand first, and write the migration as `CREATE INDEX IF NOT EXISTS`. Every table is small today, so a plain `CREATE INDEX` is fine.
- **A preview database** made from a branch copies the main database's history. If a branch's migration changes after its preview applied it, the next preview build refuses it. Delete that preview's database branch and deploy again.
- **A database that predates migrations,** such as production or a local database built by hand, has tables and no history, so migrate refuses it. Record its baseline once:
  1. Run `scripts/baseline/schema-fingerprint.sql` on it, and on a new database after `pnpm db:migrate`.
  2. If the fingerprints match, run `scripts/baseline/record-baseline.sql` on it.
  3. Check that its funds are named as in `0001_seed_funds.sql`, since the fingerprint doesn't compare data.

## Before you finish

Run the checks CI runs: `moon run :lint :format-check :typecheck :test :knip :migrations-check`. Run `pnpm build` as well when an import moved between client and server code.
