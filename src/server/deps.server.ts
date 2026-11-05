import type { Logger } from 'pino'

import type { EghlConfig, PaymentGateway } from '#/modules/payments/server'
import { createEghlClient } from '#/modules/payments/server'
import { createTokenHasher } from '#/server/crypto.server'
import type { Db } from '#/server/db.server'
import { createDb } from '#/server/db.server'
import {
  BASE_URL,
  CRON_SECRET,
  EGHL_PASSWORD,
  EGHL_SERVICE_ID,
  EGHL_URL,
  MAILERSEND_API_KEY,
  MAILERSEND_ROOT_DOMAIN,
  SESSION_SECRET,
} from '#/server/env.server'
import { logger as rootLogger } from '#/server/logger.server'
import type { MailConfig, Mailer } from '#/server/mailer.server'
import { createMailer } from '#/server/mailer.server'
import { db as neonHttp, dbPool as neonPool } from '#/server/neon.server'

/** Settings read from env once, here. Nothing else on the request path reads env. */
interface ServerConfig {
  readonly cronSecret: string | undefined
  readonly eghl: EghlConfig
  readonly mail: MailConfig
}

/**
 * Everything a workflow cannot build itself. Workflows take `Pick<Deps, ...>` of what they use.
 * `logger` is the request logger (`user_id` set once the session is known), and `eghl` logs through
 * it, so `createDeps` is called with the child logger; the rest are process singletons. The session
 * user and the open transaction are deliberately absent: one is an argument, the other is explicit
 * through `db.transaction`.
 */
export interface Deps {
  readonly config: ServerConfig
  readonly db: Db
  readonly eghl: PaymentGateway
  /** HMAC with SESSION_SECRET. */
  readonly hashToken: (raw: string) => string
  readonly logger: Logger
  readonly mailer: Mailer
}

const config: ServerConfig = {
  cronSecret: CRON_SECRET,
  eghl: { baseUrl: BASE_URL, password: EGHL_PASSWORD, serviceId: EGHL_SERVICE_ID, url: EGHL_URL },
  mail: { apiKey: MAILERSEND_API_KEY, rootDomain: MAILERSEND_ROOT_DOMAIN },
}
const db = createDb(neonHttp, neonPool)
const mailer = createMailer(config.mail, rootLogger)
const hashToken = createTokenHasher(SESSION_SECRET)

export function createDeps(logger: Logger): Deps {
  return { config, db, eghl: createEghlClient(config.eghl, logger), hashToken, logger, mailer }
}
