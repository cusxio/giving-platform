import { SpanStatusCode, trace } from '@opentelemetry/api'
import { isNotFound, isRedirect, notFound, redirect } from '@tanstack/react-router'
import type { Result } from 'better-result'
import { DrizzleQueryError } from 'drizzle-orm'

import type {
  AuthErrorResponse,
  BusinessErrorResponse,
  ServerErrorResponse,
  SuccessResponse,
  ValidationErrorResponse,
} from '#/core/wire'
import type { Forbidden, Policy, Refusal, SignedOut } from '#/server/authorize.server'
import type { Deps } from '#/server/deps.server'
import { InfraError } from '#/server/infra-error'
import type { InvalidInput, Parser } from '#/server/input.server'
import type { RequestContext } from '#/server/request-context.server'

interface Tagged {
  readonly _tag: string
}

interface Log {
  readonly event: string
  readonly fields?: Readonly<Record<string, unknown>>
  /** Defaults to `warn`. */
  readonly level?: 'debug' | 'info' | 'warn'
  readonly msg: string
}

/** A mutation's answer to a domain error: a `BUSINESS_ERROR` with this code. */
interface Business<K extends string> {
  readonly kind: 'business'
  readonly log: Log
  readonly value: BusinessErrorResponse<K>
}
/** A read's answer to a domain error: it ends the call by throwing the router's `notFound()`. */
interface Thrown {
  readonly kind: 'throw'
  readonly log?: Log
  readonly thrown: () => never
}
/**
 * A read's answer to a domain error: this value, as if the read succeeded. A mutation may answer
 * only `AUTH_ERROR` this way, for `getCurrentUser` until Phase 4 retires its envelope.
 */
interface Returned<V> {
  readonly kind: 'return'
  readonly log?: Log
  readonly value: V
}

export const business = <const K extends string>(
  code: K,
  log: Log,
  message?: string,
): Business<K> => ({
  kind: 'business',
  log,
  value: { error: { code, ...(message !== undefined && { message }) }, type: 'BUSINESS_ERROR' },
})

export const toNotFound = (log?: Log): Thrown => ({
  kind: 'throw',
  log,
  thrown: () => {
    throw notFound()
  },
})

export const returning = <const V>(value: V, log?: Log): Returned<V> => ({
  kind: 'return',
  log,
  value,
})

/**
 * One row per domain tag of the workflow's error union, and none for a tag it cannot raise.
 * `InfraError` has no row: the runner answers it.
 */
type DomainTag<E extends Tagged> = Exclude<E, InfraError>['_tag']
type Rows<E extends Tagged, I, D> = {
  readonly [T in DomainTag<E>]: (error: Extract<E, { _tag: T }>, input: NoInfer<I>) => D
}
type NoExtraRows<W, E extends Tagged> = {
  readonly [
    K in Exclude<keyof W, DomainTag<E>>
  ]: `no ${K & string} row: the workflow cannot raise it`
}

/** A mutation's `returning` row answers `AUTH_ERROR` and no other field, as the wire type says. */
type OnlyAuthError<W> = {
  readonly [K in Exclude<keyof W, never>]: W[K] extends (...args: never[]) => Returned<infer V>
    ? [Exclude<keyof V, keyof AuthErrorResponse>] extends [never]
      ? W[K]
      : `the ${K & string} row may answer only { type: 'AUTH_ERROR' }`
    : W[K]
}

type AuthMessage = 'You must be logged in to continue.'
type IsNever<T> = [T] extends [never] ? true : false
type Outcomes<W> = {
  [K in keyof W]: W[K] extends (...args: never[]) => infer R ? R : never
}[keyof W]
type CodesOf<W> = Outcomes<W> extends infer R ? (R extends Business<infer K> ? K : never) : never
type ValuesOf<W> = Outcomes<W> extends infer R ? (R extends Returned<infer V> ? V : never) : never

/** Derived from the spec: each member exists only if the procedure can produce it. */
type MutationWire<T, I, PE, K extends string, V> =
  | (IsNever<K> extends true ? never : BusinessErrorResponse<K>)
  | V
  | (IsNever<Extract<PE, Forbidden | SignedOut>> extends true
      ? never
      : AuthErrorResponse<AuthMessage>)
  | ([I] extends [undefined | void] ? never : ValidationErrorResponse)
  | ServerErrorResponse
  | SuccessResponse<T>

/** What TanStack hands a handler. An action reads `context` and `data`, nothing else. */
interface Invocation {
  readonly context: RequestContext
  readonly data?: unknown
}
type Action<W> = (invocation: Invocation) => Promise<W>

interface Spec<C, PE extends Refusal, I, T, E extends Tagged> {
  readonly auth: Policy<C, PE>
  /** The log-event prefix, such as `analytics.insights`. */
  readonly event: string
  readonly input: Parser<I>
  readonly run: (ctx: NoInfer<C>, input: NoInfer<I>) => Promise<Result<T, E>>
}

interface MutationSpec<C, PE extends Refusal, I, T, E extends Tagged, W> extends Spec<
  C,
  PE,
  I,
  T,
  E
> {
  readonly wire: W &
    Rows<E, I, Business<string> | Returned<AuthErrorResponse>> &
    NoExtraRows<W, E> &
    OnlyAuthError<W>
}

interface ReadSpec<C, PE extends Refusal, I, T, E extends Tagged, W> extends Spec<C, PE, I, T, E> {
  readonly wire: W & Rows<E, I, Returned<unknown> | Thrown> & NoExtraRows<W, E>
}

/** What the call ends with: a value to answer, or a control-flow throw. */
type Outcome = Business<string> | Returned<unknown> | Thrown

const fail = (error: unknown): Thrown => ({
  kind: 'throw',
  thrown: () => {
    throw error
  },
})
const answer = (value: unknown): Outcome => ({ kind: 'return', value })

/** Where the two procedure kinds differ. Everything else is one runtime. */
interface Kind {
  readonly invalid: (error: InvalidInput) => Outcome
  readonly ok: (value: unknown) => Outcome
  readonly refused: (error: Forbidden | SignedOut) => Outcome
  readonly serverError: () => Outcome
  readonly unauthorizedLevel: 'debug' | 'warn'
}

const MUTATION: Kind = {
  invalid: (error) => answer({ errors: error.issues, type: 'VALIDATION_ERROR' }),
  ok: (value) => answer(value === undefined ? { type: 'SUCCESS' } : { type: 'SUCCESS', value }),
  refused: () => answer({ message: 'You must be logged in to continue.', type: 'AUTH_ERROR' }),
  serverError: () => answer({ type: 'SERVER_ERROR' }),
  unauthorizedLevel: 'warn',
}

const READ: Kind = {
  invalid: () => fail(new Error('Invalid input')),
  ok: answer,
  refused: (error) =>
    fail(error._tag === 'Forbidden' ? notFound() : redirect({ to: '/auth/login' })),
  serverError: () => fail(new Error('Internal Server Error')),
  unauthorizedLevel: 'debug',
}

/**
 * A failure as it may be logged. Drizzle quotes a statement's parameters (emails, token hashes)
 * in its message and Postgres quotes values in its own, so a database error keeps only its class,
 * SQLSTATE code and SQL text. Better-result appends the cause's stack to its own, so only the
 * part above `Caused by:` is kept. No prototype, so pino's err serializer takes the type from
 * `name`.
 */
interface Loggable {
  readonly cause?: Loggable
  readonly code?: string
  readonly message: string
  readonly name: string
  readonly query?: string
  readonly stack?: string
}

function loggable(error: unknown, seen = new WeakSet<Error>()): Loggable {
  const view = Object.create(null) as Loggable
  if (error instanceof Error && seen.has(error)) {
    return Object.assign(view, { message: 'cause cycle', name: 'Circular' })
  }
  if (error instanceof DrizzleQueryError) {
    seen.add(error)
    return Object.assign(loggable(error.cause, seen), { query: error.query })
  }
  if (!(error instanceof Error)) {
    return Object.assign(view, { message: typeof error, name: typeof error })
  }
  seen.add(error)
  const { code } = error as { code?: unknown }
  if (typeof code === 'string') {
    return Object.assign(view, { code, message: `${error.name} ${code}`, name: error.name })
  }
  return Object.assign(view, {
    message: error.message,
    name: error.name,
    stack: error.stack?.split('\nCaused by: ')[0],
    ...(error.cause !== undefined && { cause: loggable(error.cause, seen) }),
  })
}

/**
 * The class, or the code when the class says nothing: a plain `Error` with a code, such as Node's
 * `ECONNREFUSED`, or the pg driver's `error`, whose code is the SQLSTATE.
 */
const typeOf = (failure: Loggable): string =>
  (failure.name === 'Error' || failure.name === 'error') && failure.code !== undefined
    ? failure.code
    : failure.name

/** A `SERVER_ERROR` envelope is an HTTP 200, so the request span would otherwise look healthy. */
function markSpanFailed(failure: Loggable, type: string, message: string) {
  const span = trace.getActiveSpan()
  span?.recordException({ message: failure.message, name: failure.name, stack: failure.stack })
  span?.setAttribute('error.type', type)
  span?.setStatus({ code: SpanStatusCode.ERROR, message })
}

interface InfraEvent {
  readonly event: string
  /** Context, such as the transaction the failure was about. */
  readonly fields?: Readonly<Record<string, unknown>>
  /** `warn` is a failure the caller recovered from, so the request span stays as it is. */
  readonly level: 'error' | 'warn'
  readonly msg: string
}

/**
 * Logs an `InfraError` with the failing `op`, the cause's type and the cause with its parameters
 * left out. At `error` it also marks the request span failed.
 */
export function logInfraEvent(
  logger: Deps['logger'],
  error: InfraError,
  { event, fields = {}, level, msg }: InfraEvent,
) {
  // `no-row` has no cause to name: the statement succeeded and returned nothing.
  const cause = error.reason === 'no-row' ? undefined : loggable(error.cause)
  const type = cause === undefined ? error.reason : typeOf(cause)
  logger[level](
    {
      ...fields,
      'error.type': type,
      ...(cause !== undefined && { err: cause }),
      event,
      op: error.op,
      ...(error.rejected !== undefined && { rejected: loggable(error.rejected).name }),
    },
    msg,
  )
  if (level === 'error') {
    markSpanFailed(cause ?? { message: error.message, name: type }, type, error.message)
  }
}

/** Logs an `InfraError` once, as `<event>.failed`, and marks the request span failed. */
export function logInfraFailure(
  logger: Deps['logger'],
  event: string,
  error: InfraError,
  fields: Readonly<Record<string, unknown>> = {},
) {
  logInfraEvent(logger, error, {
    event: `${event}.failed`,
    fields,
    level: 'error',
    msg: error.message,
  })
}

/** Logs a throw that is not control flow once, as `<event>.defect`, and fails the request span. */
function logDefect(logger: Deps['logger'], event: string, error: unknown) {
  const defect = loggable(error)
  const type = typeOf(defect)
  logger.error({ 'error.type': type, err: defect, event: `${event}.defect` }, 'Unhandled defect')
  markSpanFailed(defect, type, 'Unhandled defect')
}

/**
 * Runs an HTTP route's handler and logs a defect it throws, as the runner does for a procedure,
 * then rethrows it for the framework's 500. A router redirect or `notFound()` passes through.
 */
export async function logDefects<T>(
  logger: Deps['logger'],
  event: string,
  handler: () => Promise<T>,
): Promise<T> {
  try {
    return await handler()
  } catch (error) {
    if (!isRedirect(error) && !isNotFound(error)) {
      logDefect(logger, event, error)
    }
    throw error
  }
}

type AnySpec = Spec<unknown, Refusal, unknown, unknown, Tagged> & {
  readonly wire: Readonly<Record<string, (error: never, input: never) => Outcome>>
}

async function settle(kind: Kind, spec: AnySpec, { context, data }: Invocation): Promise<Outcome> {
  const { logger } = context.deps
  const { event } = spec

  const allowed = spec.auth(context)
  if (allowed.isErr()) {
    const refusal = allowed.error
    if (refusal._tag === 'AlreadySignedIn') {
      logger.info(
        { event: `${event}.redirected`, user_id: refusal.userId },
        'User already logged in',
      )
      return fail(redirect({ to: '/' }))
    }
    logger[kind.unauthorizedLevel]({ event: `${event}.unauthorized` }, 'Unauthorized')
    return kind.refused(refusal)
  }

  const input = spec.input(data)
  if (input.isErr()) {
    logger.warn(
      { event: `${event}.validation_failed`, issues: input.error.issues },
      input.error.message,
    )
    return kind.invalid(input.error)
  }

  const result = await spec.run(allowed.value, input.value)
  if (result.isOk()) {
    return kind.ok(result.value)
  }

  const { error } = result
  if (InfraError.is(error)) {
    logInfraFailure(logger, event, error)
    return kind.serverError()
  }

  const row = spec.wire[error._tag]!(error as never, input.value as never)
  if (row.log !== undefined) {
    logger[row.log.level ?? 'warn']({ ...row.log.fields, event: row.log.event }, row.log.msg)
  }
  return row
}

function define(kind: Kind, spec: AnySpec): Action<unknown> {
  return async (invocation) => {
    let outcome: Outcome
    try {
      outcome = await settle(kind, spec, invocation)
    } catch (error) {
      if (isRedirect(error) || isNotFound(error)) {
        throw error
      }
      logDefect(invocation.context.deps.logger, spec.event, error)
      // The client would get every own property of the original, its stack and cause included.
      // oxlint-disable-next-line preserve-caught-error
      throw new Error('Internal Server Error')
    }
    return outcome.kind === 'throw' ? outcome.thrown() : outcome.value
  }
}

/**
 * Turns a `Result` workflow into a server-function answer, in the order policy, parse, run.
 * A refused policy is `AUTH_ERROR` (a signed-in caller of `anonymousOnly` is redirected home),
 * invalid input `VALIDATION_ERROR`, a domain error its `wire` row's answer, and an
 * `InfraError` `SERVER_ERROR`, logged once as `<event>.failed`. A throw is a defect: logged as
 * `<event>.defect`, and the client gets a generic error. A router redirect or `notFound()` passes
 * through.
 */
export function defineMutation<C, PE extends Refusal, I, T, E extends Tagged, W>(
  spec: MutationSpec<C, PE, I, T, E, W>,
): Action<MutationWire<T, I, PE, CodesOf<W>, ValuesOf<W>>> {
  return define(MUTATION, spec as unknown as AnySpec) as Action<
    MutationWire<T, I, PE, CodesOf<W>, ValuesOf<W>>
  >
}

/**
 * The same runtime as `defineMutation`, answering with the bare value. A signed-out caller is
 * redirected to login, a forbidden one gets `notFound()`, and invalid input and an `InfraError`
 * throw a generic error, so a driver message never reaches the browser.
 */
export function defineRead<C, PE extends Refusal, I, T, E extends Tagged, W>(
  spec: ReadSpec<C, PE, I, T, E, W>,
): Action<T | ValuesOf<W>> {
  return define(READ, spec as unknown as AnySpec) as Action<T | ValuesOf<W>>
}
