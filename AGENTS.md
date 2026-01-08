# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Development server (port 3003)
bun dev

# Run tests
bun test:watch           # Watch mode
bun moon run test        # Single run via moon

# Lint and format
bun moon run lint        # Check linting
bun moon run format      # Check formatting
bun moon run fix/all     # Fix both lint and format issues

# Type checking
bun moon run typecheck

# Build for production
bun moon run build       # Builds via Vercel

# Database
bunx drizzle-kit push    # Push schema changes
bunx drizzle-kit studio  # Open Drizzle Studio

# Email templates
bun dev:email            # Preview email templates
```

## Architecture Overview

This is a **giving/donation platform** built with TanStack Start (React meta-framework) deployed on Vercel with Bun runtime.

### Tech Stack

- **Runtime**: Bun
- **Framework**: TanStack Start (TanStack Router + React)
- **Database**: PostgreSQL (Neon serverless) with Drizzle ORM
- **Styling**: Tailwind CSS v4
- **Payment Gateway**: eGHL (Malaysian payment provider)
- **Email**: MailerSend + React Email
- **Task Runner**: Moon (moonrepo.dev)
- **Observability**: OpenTelemetry

### Directory Structure

```
src/
├── components/          # Shared UI components
├── core/               # Core utilities (result types, formatters, money handling)
├── db/                 # Database schema and client
├── features/           # Domain features (auth, session, giving, payment-gateway, user, email)
├── routes/             # TanStack Router file-based routes
├── server/             # Server middleware and functions
└── tests/              # Test setup (MSW)
```

### Key Patterns

**Result Type Pattern**: The codebase uses a functional `Result<T, E>` pattern for error handling instead of throwing exceptions. See `src/core/result.ts`:

```typescript
const result = await someOperation()
if (!result.ok) {
  // Handle result.error
  return
}
// Use result.value
```

**Server Functions (Procedures)**: Server-side logic uses TanStack Start's `createServerFn` with middleware chains. Procedures follow the naming convention `*.procedure.ts` and return typed response objects:

```typescript
type Response =
  | SuccessResponse<T>
  | BusinessErrorResponse<ErrorCode>
  | ValidationErrorResponse
  | ServerErrorResponse
```

**Repository Pattern**: Database access is abstracted through repositories in `src/features/*/` (e.g., `user.repository.ts`, `transaction.repository.ts`).

**Middleware Chain**: Server functions use composable middleware for dependency injection (`src/server/middleware/`). Services are injected via context.

### Route Structure

Routes use TanStack Router's file-based routing with layout groups:

- `(app)/` - Authenticated app routes (requires session)
- `(auth)/` - Authentication routes (login, signup)
- `(su)/` - Super-user routes (insights, reports)
- `api/` - API routes (eGHL callbacks)

Private components/queries use `-` prefix (e.g., `-components/`, `-overview.queries.ts`).

### Database Schema

Key tables in `src/db/schema.ts`:

- `users` - User accounts with roles (admin, user, su) and journey status
- `transactions` - Donation transactions with status tracking
- `transactionItems` - Individual fund allocations per transaction
- `payments` - Payment provider responses
- `sessions` - Session management
- `funds` - Available donation funds

### Environment Configuration

Copy `mise.local.toml.example` to `mise.local.toml` and configure:

- `DATABASE_URL` - Neon PostgreSQL connection string
- `SESSION_SECRET` - Session encryption key
- `EGHL_*` - Payment gateway credentials
- `MAILERSEND_*` - Email service credentials
- `OTEL_*` - OpenTelemetry exporters (traces, logs, metrics)

### Import Alias

Use `#/` to import from `src/`:

```typescript
import { db } from '#/db/client'
```

### Commit Convention

Uses conventional commits enforced via commitlint. Pre-commit hooks run lint and format on staged files.
