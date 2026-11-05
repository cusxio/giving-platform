import type { Static } from 'typebox'
import { Type } from 'typebox'
import { Compile } from 'typebox/compile'

const exporter = Type.String({ pattern: '^(otlp|console|none)(,(otlp|console|none))*$' })

const schema = Type.Object({
  BASE_URL: Type.Optional(Type.String()),
  NODE_ENV: Type.Enum(['development', 'production']),
  SESSION_SECRET: Type.String(),
  CRON_SECRET: Type.Optional(Type.String()),
  //
  DATABASE_URL: Type.String(),
  //
  EGHL_PASSWORD: Type.String(),
  EGHL_SERVICE_ID: Type.String(),
  EGHL_URL: Type.String(),
  //
  MAILERSEND_API_KEY: Type.Optional(Type.String()),
  MAILERSEND_ROOT_DOMAIN: Type.Optional(Type.String()),
  //
  OTEL_LOG_LEVEL: Type.Optional(Type.String()),
  OTEL_TRACES_EXPORTER: exporter,
  OTEL_LOGS_EXPORTER: exporter,
})

export type Env = Static<typeof schema>

const envType = Compile(schema)

const MIN_SESSION_SECRET_LENGTH = 32

/** Each variable that is missing or malformed, with the rule it breaks. Never a value. */
function shapeProblems(source: Record<string, string | undefined>): string[] {
  return [...envType.Errors(source)].flatMap((error) =>
    error.keyword === 'required'
      ? error.params.requiredProperties.map((name) => `${name} is required`)
      : [`${error.instancePath.slice(1)} ${error.message}`],
  )
}

/**
 * What a production deployment is missing. Without a mail key, login codes would go to a test
 * inbox; without a cron secret, both crons refuse every run; a short session secret weakens the
 * hash that stores login codes. Development may run without any of them.
 */
function productionEnvProblems(env: Env): string[] {
  if (env.NODE_ENV !== 'production') {
    return []
  }
  const problems: string[] = []
  if (env.MAILERSEND_API_KEY === undefined || env.MAILERSEND_API_KEY === '') {
    problems.push('MAILERSEND_API_KEY is required in production')
  }
  if (env.CRON_SECRET === undefined || env.CRON_SECRET === '') {
    problems.push('CRON_SECRET is required in production')
  }
  if (env.SESSION_SECRET.length < MIN_SESSION_SECRET_LENGTH) {
    problems.push(
      `SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters in production`,
    )
  }
  return problems
}

/**
 * The environment the server runs with. Throws `Invalid environment: ...` naming every variable
 * that is missing or malformed, or, once the shape is right, every production rule it breaks.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const shape = shapeProblems(source)
  if (shape.length > 0) {
    throw new Error(`Invalid environment: ${shape.join('; ')}`)
  }
  const env = envType.Parse(source)
  const problems = productionEnvProblems(env)
  if (problems.length > 0) {
    throw new Error(`Invalid environment: ${problems.join('; ')}`)
  }
  return env
}
