import { addSeconds, now } from '#/core/date'
import { isCronRequest } from '#/server/cron.server'
import type { Deps } from '#/server/deps.server'
import { logDefects, logInfraFailure } from '#/server/procedure.server'

import { LONGEST_WINDOW_SECONDS } from './rate-limit.server'
import { deleteStaleAttempts } from './rate-limits.repository.server'
import { deleteDeadTokens } from './tokens.repository.server'

type CleanupDeps = Pick<Deps, 'config' | 'db' | 'logger'>

async function cleanup({ config, db, logger }: CleanupDeps, request: Request) {
  if (!isCronRequest(config.cronSecret, request.headers.get('authorization'))) {
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
