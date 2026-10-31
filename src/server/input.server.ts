import { Result, TaggedError } from 'better-result'

interface Issue {
  readonly message: string
  readonly path: string
}

/** The body did not match the procedure's schema. `issues` are the schema's own messages. */
export class InvalidInput extends TaggedError('InvalidInput')<{
  issues: readonly Issue[]
  message: string
}> {}

export type Parser<I> = (raw: unknown) => Result<I, InvalidInput>
export type Parsed<P> = P extends Parser<infer I> ? I : never

interface ParseOptions {
  /** Lower-case these string fields before validating. */
  readonly lowercase?: readonly string[]
  /** Trim these string fields before validating. */
  readonly trim?: readonly string[]
}

interface Schema<I> {
  readonly Parse: (value: unknown) => I
}

function hasIssues(
  error: unknown,
): error is { cause: { errors: { instancePath: string; message: string }[] } } {
  const errors = (error as { cause?: { errors?: unknown } } | null)?.cause?.errors
  return Array.isArray(errors)
}

function normalize(raw: unknown, options: ParseOptions): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return raw
  }
  const value: Record<string, unknown> = { ...raw }
  for (const key of options.trim ?? []) {
    const field = value[key]
    if (typeof field === 'string') {
      value[key] = field.trim()
    }
  }
  for (const key of options.lowercase ?? []) {
    const field = value[key]
    if (typeof field === 'string') {
      value[key] = field.toLowerCase()
    }
  }
  return value
}

/**
 * The whole parse step of a procedure. Normalization reads `unknown` and skips anything that is
 * not a string, so a malformed body is `InvalidInput` with the schema's issues, never a
 * `TypeError`.
 */
export function parseWith<I>(schema: Schema<I>, options: ParseOptions = {}): Parser<I> {
  return (raw) => {
    try {
      return Result.ok(schema.Parse(normalize(raw, options)))
    } catch (error) {
      if (!hasIssues(error)) {
        throw error
      }
      return Result.err(
        new InvalidInput({
          issues: error.cause.errors.map((issue) => ({
            message: issue.message,
            path: issue.instancePath,
          })),
          message: 'Input validation failed',
        }),
      )
    }
  }
}

/** For a procedure that takes no input. Whatever the client sent is dropped. */
export const noInput: Parser<void> = () => Result.ok()
