import type { Static } from 'typebox'
import { Type } from 'typebox'
import { Compile } from 'typebox/compile'

import type { MailConfig } from './mailer.server'

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
  BREVO_API_KEY: Type.Optional(Type.String()),
  MAILERSEND_API_KEY: Type.Optional(Type.String()),
  MAIL_ROOT_DOMAIN: Type.Optional(Type.String()),
  //
  OTEL_LOG_LEVEL: Type.Optional(Type.String()),
  OTEL_TRACES_EXPORTER: exporter,
  OTEL_LOGS_EXPORTER: exporter,
})

type RawEnv = Static<typeof schema>

export type Env = Omit<RawEnv, 'BREVO_API_KEY' | 'MAIL_ROOT_DOMAIN' | 'MAILERSEND_API_KEY'> & {
  readonly mail: MailConfig
}

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

const MAIL_KEYS = [
  { name: 'MAILERSEND_API_KEY', provider: 'mailersend' },
  { name: 'BREVO_API_KEY', provider: 'brevo' },
] as const

const isSet = (value: string | undefined): value is string => value !== undefined && value !== ''

function parseMail(env: RawEnv): { config: MailConfig; problems: string[] } {
  const rootDomain = isSet(env.MAIL_ROOT_DOMAIN) ? env.MAIL_ROOT_DOMAIN : undefined
  const chosen = MAIL_KEYS.flatMap(({ name, provider }) => {
    const apiKey = env[name]
    return isSet(apiKey) ? [{ apiKey, provider, rootDomain }] : []
  })
  const names = MAIL_KEYS.map(({ name }) => name)
  const testInbox = { provider: 'test', rootDomain } as const
  if (chosen.length > 1) {
    return { config: testInbox, problems: [`${names.join(' and ')} are both set; set only one`] }
  }
  const [only] = chosen
  if (only !== undefined) {
    return { config: only, problems: [] }
  }
  return {
    config: testInbox,
    problems:
      env.NODE_ENV === 'production' ? [`${names.join(' or ')} is required in production`] : [],
  }
}

/**
 * What a production deployment is missing. Without a cron secret, both crons refuse every run; a
 * short session secret weakens the hash that stores login codes. Development may run without them.
 */
function productionEnvProblems(env: RawEnv): string[] {
  if (env.NODE_ENV !== 'production') {
    return []
  }
  const problems: string[] = []
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
  const raw = envType.Parse(source)
  const mail = parseMail(raw)
  const renamed =
    source.MAILERSEND_ROOT_DOMAIN === undefined
      ? []
      : ['MAILERSEND_ROOT_DOMAIN was renamed to MAIL_ROOT_DOMAIN']
  const problems = [...renamed, ...mail.problems, ...productionEnvProblems(raw)]
  if (problems.length > 0) {
    throw new Error(`Invalid environment: ${problems.join('; ')}`)
  }
  const { BREVO_API_KEY, MAIL_ROOT_DOMAIN, MAILERSEND_API_KEY, ...env } = raw
  return { ...env, mail: mail.config }
}
