import { describe, expect, it } from 'vitest'

import { productionEnvProblems } from './env-rules'

const SECRET_32 = 's'.repeat(32)
const COMPLETE = {
  CRON_SECRET: 'cron-secret',
  MAILERSEND_API_KEY: 'mailersend-key',
  NODE_ENV: 'production',
  SESSION_SECRET: SECRET_32,
} as const

describe('the production environment', () => {
  it('accepts a complete production environment', () => {
    expect.hasAssertions()

    expect(productionEnvProblems(COMPLETE)).toStrictEqual([])
  })

  it.each([
    ['MAILERSEND_API_KEY', { MAILERSEND_API_KEY: undefined }],
    ['MAILERSEND_API_KEY', { MAILERSEND_API_KEY: '' }],
    ['CRON_SECRET', { CRON_SECRET: undefined }],
    ['CRON_SECRET', { CRON_SECRET: '' }],
    ['SESSION_SECRET', { SESSION_SECRET: 's'.repeat(31) }],
  ] as const)('names %s when production lacks it (%o)', (name, change) => {
    expect.hasAssertions()

    expect(productionEnvProblems({ ...COMPLETE, ...change })).toStrictEqual([
      expect.stringContaining(name),
    ])
  })

  it('asks nothing of development', () => {
    expect.hasAssertions()

    expect(
      productionEnvProblems({
        CRON_SECRET: undefined,
        MAILERSEND_API_KEY: undefined,
        NODE_ENV: 'development',
        SESSION_SECRET: 'short',
      }),
    ).toStrictEqual([])
  })
})
