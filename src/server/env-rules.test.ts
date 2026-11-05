import { describe, expect, it } from 'vitest'

import { parseEnv } from './env-rules'

const SECRET_32 = 's'.repeat(32)
const COMPLETE = {
  CRON_SECRET: 'cron-secret',
  DATABASE_URL: 'postgres://db.give.test/db',
  EGHL_PASSWORD: 'eghl-password',
  EGHL_SERVICE_ID: 'service-123',
  EGHL_URL: 'https://eghl.test/pay',
  MAILERSEND_API_KEY: 'mailersend-key',
  NODE_ENV: 'production',
  OTEL_LOGS_EXPORTER: 'none',
  OTEL_TRACES_EXPORTER: 'otlp,console',
  SESSION_SECRET: SECRET_32,
} as const

function without(...names: (keyof typeof COMPLETE)[]) {
  const env: Record<string, string | undefined> = { ...COMPLETE }
  for (const name of names) {
    delete env[name]
  }
  return env
}

function failure(source: Record<string, string | undefined>): string {
  try {
    parseEnv(source)
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error('expected parseEnv to throw')
}

describe('the environment', () => {
  it('is accepted when complete, ignoring variables the schema does not name', () => {
    expect.hasAssertions()

    expect(parseEnv({ ...COMPLETE, PATH: '/usr/bin' })).toMatchObject(COMPLETE)
  })

  it('names every missing variable', () => {
    expect.hasAssertions()

    expect(failure(without('DATABASE_URL', 'EGHL_URL'))).toBe(
      'Invalid environment: DATABASE_URL is required; EGHL_URL is required',
    )
  })

  it.each([
    ['NODE_ENV', 'staging', 'NODE_ENV must be equal to one of the allowed values'],
    [
      'OTEL_TRACES_EXPORTER',
      'jaeger',
      'OTEL_TRACES_EXPORTER must match pattern "^(otlp|console|none)(,(otlp|console|none))*$"',
    ],
  ])('names a malformed %s and the rule it breaks, without its value', (name, value, problem) => {
    expect.hasAssertions()

    const message = failure({ ...COMPLETE, [name]: value })

    expect(message).toBe(`Invalid environment: ${problem}`)
    expect(message).not.toContain(value)
  })

  it('reports the shape before the production rules', () => {
    expect.hasAssertions()

    expect(failure({ ...without('DATABASE_URL'), SESSION_SECRET: 'short' })).toBe(
      'Invalid environment: DATABASE_URL is required',
    )
  })
})

describe('the production environment', () => {
  it.each([
    ['MAILERSEND_API_KEY', without('MAILERSEND_API_KEY')],
    ['MAILERSEND_API_KEY', { ...COMPLETE, MAILERSEND_API_KEY: '' }],
    ['CRON_SECRET', without('CRON_SECRET')],
    ['CRON_SECRET', { ...COMPLETE, CRON_SECRET: '' }],
    ['SESSION_SECRET', { ...COMPLETE, SESSION_SECRET: 's'.repeat(31) }],
  ])('refuses to start without %s (%o)', (name, env) => {
    expect.hasAssertions()

    expect(failure(env)).toMatch(new RegExp(`^Invalid environment: ${name} .* in production$`, 'u'))
  })

  it('asks nothing of development', () => {
    expect.hasAssertions()

    const development = {
      ...without('CRON_SECRET', 'MAILERSEND_API_KEY'),
      NODE_ENV: 'development',
      SESSION_SECRET: 'short',
    }

    expect(parseEnv(development)).toMatchObject(development)
  })
})
