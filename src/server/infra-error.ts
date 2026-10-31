import { TaggedError } from 'better-result'

/**
 * The one infrastructure failure: a database call failed, or returned less than the code needs.
 * No caller can act on it, so workflows pass it up unchanged and the boundary logs it once.
 * `op` is the failing query's name or a dotted label such as `db.transaction`.
 */
// oxlint-disable-next-line unicorn/throw-new-error -- TaggedError('Tag') builds a class, it throws nothing
export class InfraError extends TaggedError('InfraError')<{
  cause: unknown
  message: string
  op: string
  /** `no-row` is a statement that should have returned a row and did not. */
  reason: 'failed' | 'no-row'
}> {}

/** `op` failed with `cause`, as the driver or the decoder threw it. */
export const infra = (op: string, cause: unknown): InfraError =>
  new InfraError({ cause, message: `${op} failed`, op, reason: 'failed' })
