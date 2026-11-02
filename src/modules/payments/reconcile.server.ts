import type { Deps } from '#/server/deps.server'
import { logDefects, logInfraFailure } from '#/server/procedure.server'

import { settlePolled } from './settlement.server'
import { pendingTransactionsToReconcile } from './transactions.repository.server'

type ReconcileDeps = Pick<Deps, 'config' | 'db' | 'eghl' | 'logger'>

async function reconcile(deps: ReconcileDeps, request: Request) {
  const { config, db, logger } = deps
  const authHeader = request.headers.get('authorization')

  if (config.cronSecret === undefined || authHeader !== `Bearer ${config.cronSecret}`) {
    logger.warn({ event: 'eghl.cron.unauthorized' }, 'Unauthorized cron job attempt')
    return new Response('Unauthorized', { status: 401 })
  }

  logger.info({ event: 'eghl.cron.job_start' }, 'Starting eGHL cron job')

  const pending = await db.run(pendingTransactionsToReconcile())
  if (pending.isErr()) {
    logInfraFailure(logger, 'eghl.cron', pending.error)
    return new Response('Internal Server Error', { status: 500 })
  }
  const pendingTransactions = pending.value

  let finalizedCount = 0
  let failCount = 0
  let errorCount = 0

  for (const pendingTransaction of pendingTransactions) {
    // Sequential by design: avoid concurrent requests to eGHL/payment finalization side effects.
    // oxlint-disable-next-line no-await-in-loop
    const settled = await settlePolled(deps, pendingTransaction)

    if (settled.isErr()) {
      logInfraFailure(logger, 'eghl.cron', settled.error, {
        transaction_id: pendingTransaction.transactionId,
      })
      errorCount++
      continue
    }

    if (settled.value.kind === 'query_failed' || settled.value.kind === 'held') {
      errorCount++
    } else if (settled.value.kind === 'moved') {
      if (settled.value.via === 'expired') {
        failCount++
      } else {
        finalizedCount++
      }
    }
  }

  logger.info(
    {
      event: 'eghl.cron.complete',
      stats: {
        errors: errorCount,
        finalized: finalizedCount,
        found: pendingTransactions.length,
        marked_failed: failCount,
      },
    },
    'eGHL cron job complete',
  )

  return new Response('ok', { headers: { 'Content-Type': 'text/plain' }, status: 200 })
}

/** The cron job: settles pending transactions from the gateway's own status. */
export const handleReconcile = (deps: ReconcileDeps, request: Request) =>
  logDefects(deps.logger, 'eghl.cron', () => reconcile(deps, request))
