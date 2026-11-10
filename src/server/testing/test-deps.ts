import { pino } from 'pino'

import { createEghlClient } from '#/modules/payments/server'
import type { Deps } from '#/server/deps.server'

import { createFakeDb } from './fake-db'

const eghl = {
  baseUrl: 'https://app.give.test',
  password: 'secret-password',
  serviceId: 'service-123',
  url: 'https://eghl.test/pay',
}

/** Deps for a workflow test. Nothing touches env, the network, or a database unless overridden. */
export function testDeps(overrides: Partial<Deps> = {}): Deps {
  const logger = overrides.logger ?? pino({ level: 'silent' })
  return {
    config: {
      cronSecret: 'test-cron-secret',
      eghl,
      mail: { provider: 'test', rootDomain: undefined },
    },
    db: createFakeDb(),
    eghl: createEghlClient(eghl, logger),
    hashToken: (raw) => `hashed:${raw}`,
    logger,
    mailer: { send: () => Promise.reject(new Error('testDeps has no mailer; pass one in')) },
    ...overrides,
  }
}
