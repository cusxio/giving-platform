import type { Logger } from 'pino'

import { hashToken } from '#/server/crypto.server'
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
} from '#/server/env.server'
import { logger as rootLogger } from '#/server/logger.server'
import type { MailConfig, Mailer } from '#/server/mailer.server'
import { createMailer } from '#/server/mailer.server'
import { db as neonHttp, dbPool as neonPool } from '#/server/neon.server'

interface EghlConfig {
  /** Origin the gateway calls back and returns the donor to. */
  readonly baseUrl: string
  readonly password: string
  readonly serviceId: string
  readonly url: string
}

/** Settings read from env once, here. Nothing else on the request path reads env. */
interface ServerConfig {
  /** Bearer token the cron route accepts. Unset means the route rejects every call. */
  readonly cronSecret: string | undefined
  readonly eghl: EghlConfig
  readonly mail: MailConfig
}

/**
 * Everything a workflow cannot build itself. Workflows take `Pick<Deps, ...>` of what they use.
 * `logger` is request-scoped (carries `user_id`); the rest are process singletons. The session
 * user and the open transaction are deliberately absent: one is an argument, the other is
 * explicit through `db.transaction`.
 */
export interface Deps {
  readonly config: ServerConfig
  readonly db: Db
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

export function createDeps(logger: Logger): Deps {
  return { config, db, hashToken, logger, mailer }
}
