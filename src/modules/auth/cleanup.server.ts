import { addSeconds, now } from '#/core/date'
import type { Deps } from '#/server/deps.server'
import { logDefects, logInfraFailure } from '#/server/procedure.server'

import { LONGEST_WINDOW_SECONDS } from './rate-limit.server'
import { deleteStaleAttempts } from './rate-limits.repository.server'
import { deleteDeadTokens } from './tokens.repository.server'

type CleanupDeps = Pick<Deps, 'config' | 'db' | 'logger'>

/**
 * Deletes the rows the login flow leaves behind: claimed and expired codes, and rate-limit rows
 * whose window no limit can still count. Each delete runs on its own, so one failing leaves the
 * other done.
 */
async function cleanup({ config, db, logger }: CleanupDeps, request: Request) {
  const authHeader = request.headers.get('authorization')
  if (config.cronSecret === undefined || authHeader !== `Bearer ${config.cronSecret}`) {
    logger.warn({ event: 'auth.cron.unauthorized' }, 'Unauthorized cron job attempt')
    return new Response('Unauthorized', { status: 401 })
  }

  const deadTokens = await db.run(deleteDeadTokens())
  const staleAttempts = await db.run(
    deleteStaleAttempts(addSeconds(now(), -LONGEST_WINDOW_SECONDS)),
  )
  for (const deleted of [deadTokens, staleAttempts]) {
    if (deleted.isErr()) {
      logInfraFailure(logger, 'auth.cron', deleted.error)
    }
  }
  if (deadTokens.isErr() || staleAttempts.isErr()) {
    return new Response('Internal Server Error', { status: 500 })
  }

  logger.info(
    {
      event: 'auth.cron.complete',
      stats: { dead_tokens: deadTokens.value, stale_attempts: staleAttempts.value },
    },
    'Auth cleanup complete',
  )
  return new Response('ok', { headers: { 'Content-Type': 'text/plain' }, status: 200 })
}

/** The daily cron job: removes dead codes and stale rate-limit rows. */
export const handleCleanup = (deps: CleanupDeps, request: Request) =>
  logDefects(deps.logger, 'auth.cron', () => cleanup(deps, request))
