import { describe, expect, it } from 'vitest'

import { parseEnv } from './env-rules'

const SECRET_32 = 's'.repeat(32)
const COMPLETE = {
  BASE_URL: 'https://give.test',
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

    const { MAILERSEND_API_KEY, ...rest } = COMPLETE

    expect(parseEnv({ ...COMPLETE, PATH: '/usr/bin' })).toMatchObject(rest)
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
    ['MAILERSEND_API_KEY or BREVO_API_KEY', without('MAILERSEND_API_KEY')],
    ['MAILERSEND_API_KEY or BREVO_API_KEY', { ...COMPLETE, MAILERSEND_API_KEY: '' }],
    [
      'MAILERSEND_API_KEY or BREVO_API_KEY',
      { ...COMPLETE, BREVO_API_KEY: '', MAILERSEND_API_KEY: '' },
    ],
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

describe('the address payers return to', () => {
  const VERCEL = {
    VERCEL_BRANCH_URL: 'app-git-feature-team.vercel.app',
    VERCEL_PROJECT_PRODUCTION_URL: 'give.test',
    VERCEL_URL: 'app-abc123-team.vercel.app',
  }

  it.each([
    ['a preview', 'preview', 'https://app-git-feature-team.vercel.app'],
    ['production', 'production', 'https://give.test'],
  ])('is the address people use on %s, not the one deployment', (_name, vercelEnv, expected) => {
    expect.hasAssertions()

    const env = parseEnv({ ...without('BASE_URL'), ...VERCEL, VERCEL_ENV: vercelEnv })

    expect(env.BASE_URL).toBe(expected)
  })

  it('is BASE_URL when it is set', () => {
    expect.hasAssertions()

    expect(parseEnv({ ...COMPLETE, ...VERCEL, VERCEL_ENV: 'preview' }).BASE_URL).toBe(
      'https://give.test',
    )
  })

  it('falls back to the deployment address when Vercel names no other', () => {
    expect.hasAssertions()

    const env = parseEnv({
      ...without('BASE_URL'),
      VERCEL_ENV: 'preview',
      VERCEL_URL: VERCEL.VERCEL_URL,
    })

    expect(env.BASE_URL).toBe('https://app-abc123-team.vercel.app')
  })

  it('is localhost in development', () => {
    expect.hasAssertions()

    expect(parseEnv({ ...without('BASE_URL'), NODE_ENV: 'development' }).BASE_URL).toBe(
      'http://localhost:3003',
    )
  })

  it('is required in production outside Vercel', () => {
    expect.hasAssertions()

    expect(failure(without('BASE_URL'))).toBe(
      'Invalid environment: BASE_URL is required outside Vercel',
    )
  })
})

describe('the mail settings', () => {
  const DEVELOPMENT = { ...without('MAILERSEND_API_KEY'), NODE_ENV: 'development' }

  it.each([
    ['MailerSend', { MAILERSEND_API_KEY: 'mailersend-key' }, 'mailersend', 'mailersend-key'],
    ['Brevo', { BREVO_API_KEY: 'brevo-key' }, 'brevo', 'brevo-key'],
  ])('send through %s when only its key is set', (_name, keys, provider, apiKey) => {
    expect.hasAssertions()

    expect(parseEnv({ ...DEVELOPMENT, ...keys, MAIL_ROOT_DOMAIN: 'demo.test' }).mail).toStrictEqual(
      { apiKey, provider, rootDomain: 'demo.test' },
    )
  })

  it.each([
    ['no key', {}],
    ['empty keys', { BREVO_API_KEY: '', MAILERSEND_API_KEY: '' }],
  ])('send to the test inbox in development with %s', (_name, keys) => {
    expect.hasAssertions()

    expect(parseEnv({ ...DEVELOPMENT, ...keys }).mail).toStrictEqual({
      provider: 'test',
      rootDomain: undefined,
    })
  })

  it('fall back to the brand addresses when the root domain is empty', () => {
    expect.hasAssertions()

    expect(parseEnv({ ...COMPLETE, MAIL_ROOT_DOMAIN: '' }).mail.rootDomain).toBeUndefined()
  })

  it.each([
    ['MailerSend', COMPLETE],
    ['Brevo', { ...without('MAILERSEND_API_KEY'), BREVO_API_KEY: 'brevo-key' }],
  ])('keep the raw keys out of the parsed environment with %s', (_name, source) => {
    expect.hasAssertions()

    const keys = Object.keys(parseEnv({ ...source, MAIL_ROOT_DOMAIN: 'demo.test' }))

    expect(keys).not.toContain('MAILERSEND_API_KEY')
    expect(keys).not.toContain('BREVO_API_KEY')
    expect(keys).not.toContain('MAIL_ROOT_DOMAIN')
  })

  it.each(['production', 'development'])(
    'refuse the old MAILERSEND_ROOT_DOMAIN in %s, naming its new name but not its value',
    (nodeEnv) => {
      expect.hasAssertions()

      const message = failure({
        ...COMPLETE,
        MAILERSEND_ROOT_DOMAIN: 'old-domain-value',
        NODE_ENV: nodeEnv,
      })

      expect(message).toBe(
        'Invalid environment: MAILERSEND_ROOT_DOMAIN was renamed to MAIL_ROOT_DOMAIN',
      )
    },
  )

  it.each(['production', 'development'])(
    'refuse both keys in %s, naming the variables but not their values',
    (nodeEnv) => {
      expect.hasAssertions()

      const message = failure({
        ...COMPLETE,
        BREVO_API_KEY: 'brevo-secret-value',
        MAILERSEND_API_KEY: 'mailersend-secret-value',
        NODE_ENV: nodeEnv,
      })

      expect(message).toBe(
        'Invalid environment: MAILERSEND_API_KEY and BREVO_API_KEY are both set; set only one',
      )
      expect(message).not.toContain('secret-value')
    },
  )

  it('name the missing keys in production without any other value', () => {
    expect.hasAssertions()

    const message = failure({ ...without('MAILERSEND_API_KEY'), MAIL_ROOT_DOMAIN: 'demo.test' })

    expect(message).toBe(
      'Invalid environment: MAILERSEND_API_KEY or BREVO_API_KEY is required in production',
    )
    expect(message).not.toContain('demo.test')
  })

  it('accept Brevo alone in production', () => {
    expect.hasAssertions()

    expect(
      parseEnv({ ...without('MAILERSEND_API_KEY'), BREVO_API_KEY: 'brevo-key' }).mail,
    ).toStrictEqual({ apiKey: 'brevo-key', provider: 'brevo', rootDomain: undefined })
  })
})
