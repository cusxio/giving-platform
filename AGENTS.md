# Agent guide

To add a feature, copy the nearest module in `src/modules/`. The table below is the convention. The lint rules in `oxlint.config.ts` enforce the module rules that follow it (entry points, SQL placement, platform internals, repositories in client files), and each lint message names the fix. `vite build` enforces the `*.server.ts` rule. Where the table is stricter than lint, follow the table.

## Where each kind of file lives

| File                                           | Holds                                                                                                                                          | May import                                                                                                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/<m>/index.ts`                     | The client entry: query options, mutation hooks, client-safe types.                                                                            | Its own module's client files.                                                                                                                        |
| `src/modules/<m>/server.ts`                    | The server entry: what other modules and `src/server/` may use.                                                                                | Any file in its module.                                                                                                                               |
| `src/modules/<m>/<m>.functions.ts`             | `createServerFn` exports, each one line: `.validator(wireInput<T>()).handler((ctx) => xAction(ctx))`.                                          | `*.server.ts` workflows, never a repository.                                                                                                          |
| `src/modules/<m>/<m>.queries.ts`               | `queryOptions`, query keys, and mutation hooks.                                                                                                | `*.functions.ts`, `*.types.ts`, pure files, and `*Input` types from `*.server.ts`.                                                                    |
| `src/modules/<m>/<m>.types.ts`                 | Client-safe types, derived from the server function return types.                                                                              | `*.functions.ts`.                                                                                                                                     |
| `src/modules/<m>/<m>.errors.ts`                | Domain errors: `TaggedError` classes, one per outcome a caller handles differently.                                                            | `better-result`.                                                                                                                                      |
| `src/modules/<m>/<thing>.ts`                   | Pure domain code that runs on the client and the server. It declares the row shapes it reads.                                                  | Other pure code.                                                                                                                                      |
| `src/modules/<m>/<use-case>.server.ts`         | Workflows `(deps, input) => Promise<Result>` and the actions (`defineMutation`, `defineRead`) that the server functions call.                  | Any file in its module, other modules' `server.ts`, `#/server/db.server`, `#/server/deps.server`.                                                     |
| `src/modules/<m>/<table>.repository.server.ts` | `defineQuery(...)` factories. The only module files that import `drizzle-orm` or the schema.                                                   | `drizzle-orm`, `#/server/schema.server`, `#/server/sql.server`.                                                                                       |
| `src/server/`                                  | Platform code: the db port, the runner, policies, input parsing, neon clients, schema, env, root logger, mailer, `deps.server.ts`, middleware. | Anything, but other modules only through their entries.                                                                                               |
| `src/server/testing/`                          | `createFakeDb`, `testDeps`, `testContext`, `okValue`/`errValue`, `recordingLogger` and span helpers for tests.                                 | Anything, but other modules only through their entries.                                                                                               |
| `src/core/`                                    | Isomorphic helpers: brand, date, money, formatters, wire envelope types.                                                                       | No server code.                                                                                                                                       |
| `src/routes/`                                  | File routes plus route-local `-components/` and `-hooks/`. `routes/api/` routes are one-line bindings to a module's `server.ts`.               | Client entries, `src/components/`, `src/hooks/`, `src/core/`. Only `routes/api/` may use `#/modules/<m>/server`.                                      |
| `src/components/`, `src/hooks/`                | Shared UI and client hooks.                                                                                                                    | Client entries and `src/core/`. No server code.                                                                                                       |
| `src/entry-*.tsx`, `src/router.tsx`            | App entries.                                                                                                                                   | Client code. Only `entry-server.tsx` and `entry-start.tsx` may import `src/server/`, and `entry-start.tsx` does so only behind `import.meta.env.SSR`. |

## Module rules

- Import another module only through `#/modules/<m>` (client) or `#/modules/<m>/server` (server). Never use a relative path into `src/modules/`.
- Modules are flat. Import siblings with `./`. A subfolder holds only leaf files that import nothing above them, such as `auth/emails/`.
- A file named `*.server.ts` never reaches the browser. `vite build` fails with `Import denied in client environment` when client code imports one.
- SQL lives only in `*.repository.server.ts`. The module that owns a table is its only writer. `history` and `analytics` read other modules' tables and write nothing.
- Client-reachable module files never import a repository, even for types. Client-reachable means every module file except `*.server.ts`, `server.ts`, and tests.
- Workflows get infrastructure from `deps` as `Pick<Deps, ...>`. Only `src/server/` imports env, the root logger, and the neon clients.
- A `defineQuery` name is `<module>.<factory name>`, such as `history.transactionItemsOf`.
- Don't export a name that only its own file uses.
- Never name a server file `*.client.*`. TanStack Start import protection denies those files on the server.

## Errors

Every failure is one of three kinds.

- A domain error is a `TaggedError` from `<m>.errors.ts`, returned as `Result.err`. It names what happened, never how the client sees it.
- `InfraError` (`src/server/infra-error.ts`) is any database, mailer or decoder failure. `op` names the failing query or label. Workflows pass it up unchanged; nobody maps it to a domain error. `required(row, op)` turns a missing `RETURNING` row into one.
- A defect is any throw, including the `Panic` that `Result.gen` makes of a throw or a rejected await inside it. It is never caught and turned into an `Err`.

The `Db` port returns `Result`: `deps.db.run(query)`, `deps.db.batch([...])` and `deps.db.transaction(work)` answer `Err(InfraError)` instead of throwing. A transaction rolls back when `work` returns `Err` and returns that `Err`; a throw from `work` rolls back and rethrows.

Write a workflow as `Result.gen` and `yield* Result.await(...)` each step. Never throw a `redirect` or `notFound` from a workflow: inside `Result.gen` it becomes a `Panic` and a 500. Return a domain error and answer it in the action's `wire` table.

## Procedures

`src/server/procedure.server.ts` is the runner. It has two front doors with one runtime: policy, parse, run, settle.

- `defineMutation` answers an envelope: `SUCCESS`, a `BUSINESS_ERROR` per `business(...)` row, `AUTH_ERROR` when the policy refuses, `VALIDATION_ERROR` for bad input, and `SERVER_ERROR` for an `InfraError`.
- `defineRead` answers the bare value. A refused policy redirects to login (or `notFound()` when forbidden), and bad input or an `InfraError` throws a generic error, so no driver message reaches the browser. Rows are `toNotFound()` or `returning(value)`.

An action's spec has `auth`, `event`, `input`, `run` and `wire`. `wire` has exactly one row per domain error `run` can return; tsc names a missing or extra row. The wire type is derived from the spec, so `<m>.types.ts` reads it with `Awaited<ReturnType<typeof fn>>`. `src/server/procedure-bindings.test.ts` fails on a `*.functions.ts` export of any other shape than the one-line binding.

- Policies (`src/server/authorize.server.ts`): `anyone`, `anonymousOnly` (a signed-in caller is redirected home), `requireUser`, `requireSu`. The workflow's context is the policy's narrowed one, so `user` is non-null under `requireUser`.
- Input: `parseWith(Compile(schema), { trim, lowercase, convert })` returns a `Parser`; `noInput` takes none. The client's input type is `Parsed<typeof parser>`, exported as `<Name>Input`. Bound string inputs with `maxLength` when they reach a sized column.

## Payment gateway

`payments/gateway.ts` is the port: `deps.eghl` takes and returns only the domain types of `payments/payment-outcome.ts` (`GatewayReply`, `PaymentOutcome`, `PaymentRecord`, amounts in cents). eGHL wire fields (PascalCase) stay in three files:

- `eghl.wire.ts` holds the reply schemas and status enums.
- `eghl.outcome.ts` maps a verified wire reply or answer to a domain value. It is pure, and takes only a `Verified` value.
- `eghl.gateway.server.ts` signs, sends and verifies, and logs each wire status code (`eghl.reply.verified`, `eghl.query.answered`). It alone marks a reply `Verified`, once its signature matches, and an answer once its signature matches and it names the queried PaymentID and Amount.

A busy gateway (an internal error) is `Err(EghlGatewayBusyError)` from `queryStatus`, not an outcome. `gateway.types.test.ts` fails tsc when a PascalCase key reaches anything the port takes or returns. Handlers and the cron never import `eghl.wire.ts`.

## Transaction status

`src/core/transaction-status.ts` owns the vocabulary: `TRANSACTION_STATUSES`, the `TRANSITIONS` table, `sourcesOf` (its inverse), and the history and analytics facets (`LISTED_STATUSES`, `COUNTED_STATUS`). The schema's status enum, the `TransactionStatus` type that `#/modules/payments` re-exports, and the history and analytics filters all derive from it. Add a status there; tsc then lists every `Record<TransactionStatus, ...>` and facet that needs an entry.

`payments/record-outcome.server.ts` is the only writer of `transactions.status`. Inside one `db.transaction` it runs `lockTransaction` (`SELECT ... FOR UPDATE`), the pure `planTransition(stored, outcome)`, and on a move `moveTransaction(transition)`, the payments insert and the card step. `moveTransaction` takes a `Transition` that only `planTransition` constructs, and its WHERE lists `sourcesOf(to)`, so the database refuses what the table refuses. A compare-and-set that finds no row after the lock is an `InfraError`, never a silent no-op, and so is a stored status outside the tuple. Nothing else updates a transaction's status.

Every channel settles through `payments/settlement.server.ts`: the callback and both returns call `settleReply(deps, reply, source)`, and the cron calls `settlePolled(deps, row)` once per pending row. Each asks the gateway when it must, lets the pure `decide(outcome, context)` in `payment-outcome.ts` say what the answer means for the row, and then records through `recordOutcome` or waits. Change what an answer means in `decide`, never in a handler or the cron. `oxlint.config.ts` enforces the path: only `settlement.server.ts` imports `record-outcome.server`, and only `record-outcome.server.ts` imports `lockTransaction` and `moveTransaction`.

## Logs and traces

- The runner logs each outcome once: a row's own `event`, `<event>.unauthorized`, `<event>.validation_failed` (with `issues`), `<event>.failed` for an `InfraError`, and `<event>.defect` for a throw.
- A failure log carries `error.type` (the class, or a SQLSTATE or system code when the class is generic), `op`, and `err` with the class, code and SQL text but no query parameters or database messages. Never log a raw driver error yourself: use `logInfraFailure` or `logInfraEvent`.
- A `SERVER_ERROR` envelope is an HTTP 200, so `<event>.failed` and `<event>.defect` also mark the request span `ERROR` and record the exception. Healthy spans stay `UNSET`.
- An HTTP route that is not a server function wraps its handler in `logDefects(logger, event, handler)` so a defect is logged once and rethrown.

## Lint bans

- `redirect` and `notFound` from `@tanstack/react-router` are banned in `src/modules/**/*.server.ts` and `src/server/**`. Only the runner, `eghl.http.server.ts`, `session.server.ts` (logout) and `maintenance.server.ts` throw them, all outside any workflow.
- `Panic` and `panic` from `better-result` are banned everywhere except the runner (`src/server/procedure.server.ts`), tests in `src/modules/**` (`*.test.ts`, `*.test.tsx`) and tests in `src/server/**` (`*.test.ts`). Tests elsewhere, such as in `src/core/**` or `src/routes/**`, may not import them.

## Tests

- Test pure files directly, with plain rows and no fakes.
- Test workflows by calling them with `createFakeDb()` and `testDeps(overrides)`, and read their `Result` with `okValue` or `errValue`. Don't mock env.
- Test an action by calling it with `{ context: testContext(user, deps), data }`. Assert the wire answer and the log lines from `recordingLogger()`.
- `createFakeDb().on(factory, impl)` answers a query. The `impl` type comes from the real factory, so a fake cannot drift from the query. An `impl` that throws is a failed statement: `Err(InfraError)`.
- `db.calls` lists every query with its arguments. `db.roundTrips` lists the query names each database round trip carried. Assert `roundTrips` for every workflow that batches, so a lost `db.batch` fails a test. `db.transactions` lists each transaction's `commit` or `rollback`.
- Pin exact SQL with `createDriverDb` when the statement's text matters, such as an `ORDER BY`.

## Checks

CI runs `moon ci :lint :format-check :typecheck :test :bundle :knip`. `bundle` is `vite build`, the only check that catches server code reaching the client.
