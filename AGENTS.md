# Agent guide

To add a feature, copy the nearest module in `src/modules/`. The table below is the convention. The lint rules in `oxlint.config.ts` enforce the module rules that follow it (entry points, SQL placement, platform internals, repositories in client files), and each lint message names the fix. `vite build` enforces the `*.server.ts` rule. Where the table is stricter than lint, follow the table.

## Where each kind of file lives

| File                                           | Holds                                                                                                                                          | May import                                                                                                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/<m>/index.ts`                     | The client entry: query options, mutation hooks, client-safe types.                                                                            | Its own module's client files.                                                                                                                        |
| `src/modules/<m>/server.ts`                    | The server entry: what other modules and `src/server/` may use.                                                                                | Any file in its module.                                                                                                                               |
| `src/modules/<m>/<m>.functions.ts`             | `createServerFn` exports. Handlers stay thin, usually one call into a `*.server.ts` file.                                                      | `*.server.ts` workflows, never a repository.                                                                                                          |
| `src/modules/<m>/<m>.queries.ts`               | `queryOptions`, query keys, and mutation hooks.                                                                                                | `*.functions.ts`, `*.types.ts`, pure files, and `*Input` types from `*.server.ts`.                                                                    |
| `src/modules/<m>/<m>.types.ts`                 | Client-safe types, derived from the server function return types.                                                                              | `*.functions.ts`.                                                                                                                                     |
| `src/modules/<m>/<m>.errors.ts`                | Domain error types.                                                                                                                            | `src/core/`.                                                                                                                                          |
| `src/modules/<m>/<thing>.ts`                   | Pure domain code that runs on the client and the server. It declares the row shapes it reads.                                                  | Other pure code.                                                                                                                                      |
| `src/modules/<m>/<use-case>.server.ts`         | Workflows `(deps, input) => result` and the `*Procedure` adapters that the server functions call.                                              | Any file in its module, other modules' `server.ts`, `#/server/db.server`, `#/server/deps.server`.                                                     |
| `src/modules/<m>/<table>.repository.server.ts` | `defineQuery(...)` factories. The only module files that import `drizzle-orm` or the schema.                                                   | `drizzle-orm`, `#/server/schema.server`, `#/server/sql.server`.                                                                                       |
| `src/server/`                                  | Platform code: the db port, neon clients, schema, env, root logger, mailer, the `deps.server.ts` composition root, and the request middleware. | Anything, but other modules only through their entries.                                                                                               |
| `src/server/testing/`                          | `createFakeDb` and `testDeps` for workflow tests.                                                                                              | Anything, but other modules only through their entries.                                                                                               |
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

## Tests

- Test pure files directly, with plain rows and no fakes.
- Test workflows by calling them with `createFakeDb()` and `testDeps(overrides)`. Don't mock env.
- `createFakeDb().on(factory, impl)` answers a query. The `impl` type comes from the real factory, so a fake cannot drift from the query.
- `db.calls` lists every query with its arguments. `db.roundTrips` lists the query names each database round trip carried. Assert `roundTrips` for every workflow that batches, so a lost `db.batch` fails a test.

## Checks

CI runs `moon ci :lint :format-check :typecheck :test :bundle :knip`. `bundle` is `vite build`, the only check that catches server code reaching the client.
