import { pino } from 'pino'

import type { Deps } from '#/server/deps.server'

import { createFakeDb } from './fake-db'

/** Deps for a workflow test. Nothing touches env, the network, or a database unless overridden. */
export function testDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    config: {
      cronSecret: 'test-cron-secret',
      eghl: {
        baseUrl: 'https://app.give.test',
        password: 'secret-password',
        serviceId: 'service-123',
        url: 'https://eghl.test/pay',
      },
      mail: { apiKey: undefined, rootDomain: undefined },
    },
    db: createFakeDb(),
    hashToken: (raw) => `hashed:${raw}`,
    logger: pino({ level: 'silent' }),
    mailer: { send: () => Promise.reject(new Error('testDeps has no mailer; pass one in')) },
    ...overrides,
  }
}
