import { addMinutes, differenceInMinutes, isBefore, now } from '#/core/date'
import type { Deps } from '#/server/deps.server'
import { logInfraFailure } from '#/server/procedure.server'

import type { EghlQueryError } from './eghl.errors'
import { finalStatusOf } from './eghl.outcome'
import { EghlTxnExists } from './eghl.wire'
import { recordOutcome } from './record-outcome.server'
import {
  markPendingTransactionsFailed,
  pendingTransactionsToReconcile,
} from './transactions.repository.server'

const LOG_EVENTS = {
  COMPLETE: 'eghl.cron.complete',
  JOB_START: 'eghl.cron.job_start',
  NOT_EXISTS: 'eghl.cron.not_exists',
  QUERY_FAILED: 'eghl.cron.query_failed',
  STILL_PENDING: 'eghl.cron.still_pending',
  SYNCING_STATUS: 'eghl.cron.syncing_status',
  UNAUTHORIZED: 'eghl.cron.unauthorized',
}

/** How a failed status query is logged: its tag, and the error behind it when there is one. */
const queryFailureFields = (error: EghlQueryError) =>
  error.match<EghlQueryError, { 'error.type': string; err?: unknown }>({
    EghlFetchError: ({ _tag, cause }) => ({ 'error.type': _tag, err: cause }),
    EghlQueryMismatchError: ({ _tag }) => ({ 'error.type': _tag }),
    EghlQueryResponseError: ({ _tag }) => ({ 'error.type': _tag }),
    EghlServerError: ({ _tag }) => ({ 'error.type': _tag }),
    EghlVerificationError: ({ _tag }) => ({ 'error.type': _tag }),
    ParseError: ({ _tag, cause }) => ({ 'error.type': _tag, err: cause }),
  })

/** The cron job: settles pending transactions from the gateway's own status. */
export async function handleReconcile(
  deps: Pick<Deps, 'config' | 'db' | 'eghl' | 'logger'>,
  request: Request,
) {
  const { config, db, eghl, logger } = deps
  const authHeader = request.headers.get('authorization')

  if (config.cronSecret === undefined || authHeader !== `Bearer ${config.cronSecret}`) {
    logger.warn({ event: LOG_EVENTS.UNAUTHORIZED }, 'Unauthorized cron job attempt')
    return new Response('Unauthorized', { status: 401 })
  }

  logger.info({ event: LOG_EVENTS.JOB_START }, 'Starting eGHL cron job')

  const pending = await db.run(pendingTransactionsToReconcile())
  if (pending.isErr()) {
    logInfraFailure(logger, 'eghl.cron', pending.error)
    return new Response('Internal Server Error', { status: 500 })
  }
  const pendingTransactions = pending.value

  let finalizedCount = 0
  let failCount = 0
  let errorCount = 0

  // Collect transaction IDs to mark as failed for batch update
  const transactionsToMarkFailed: string[] = []

  for (const pendingTransaction of pendingTransactions) {
    // Sequential by design: avoid concurrent requests to eGHL/payment finalization side effects.
    // oxlint-disable-next-line no-await-in-loop
    const result = await eghl.queryStatus({
      amountInCents: pendingTransaction.amountInCents,
      transactionId: pendingTransaction.transactionId,
    })

    if (result.isErr()) {
      logger.error(
        {
          ...queryFailureFields(result.error),
          event: LOG_EVENTS.QUERY_FAILED,
          transaction_id: pendingTransaction.transactionId,
        },
        'Failed to query eGHL status',
      )
      errorCount++
      continue
    }

    const eghlResponse = result.value

    // EGHL internal error - skip and retry on next cron run
    if (eghlResponse.TxnExists === EghlTxnExists.InternalError) {
      logger.warn(
        {
          event: LOG_EVENTS.QUERY_FAILED,
          query_desc: eghlResponse.QueryDesc,
          transaction_id: pendingTransaction.transactionId,
          txn_exists: eghlResponse.TxnExists,
        },
        'eGHL returned internal error. Will retry on next run',
      )
      errorCount++
      continue
    }

    // Transaction not found at eGHL
    if (eghlResponse.TxnExists === EghlTxnExists.NotFound) {
      // SAFEGUARD: Only mark as failed if it's older than 30 minutes.
      // This accounts for the 10-minute gateway timeout + buffers.
      if (isBefore(pendingTransaction.createdAt, addMinutes(now(), -30))) {
        const ageMinutes = differenceInMinutes(now(), pendingTransaction.createdAt)

        logger.info(
          {
            age_minutes: ageMinutes,
            event: LOG_EVENTS.NOT_EXISTS,
            transaction_id: pendingTransaction.transactionId,
          },
          'Transaction not found in eGHL. Marking as failed locally',
        )

        transactionsToMarkFailed.push(pendingTransaction.transactionId)
      }
      continue
    }

    const finalStatus = finalStatusOf(eghlResponse)

    if (finalStatus === null) {
      logger.info(
        {
          event: LOG_EVENTS.STILL_PENDING,
          status: eghlResponse.TxnStatus,
          transaction_id: eghlResponse.PaymentID,
        },
        'Gateway status does not settle the transaction. Skipping',
      )
      continue
    }

    // Success or Failed at eGHL -> Sync to DB
    logger.info(
      {
        event: LOG_EVENTS.SYNCING_STATUS,
        status: eghlResponse.TxnStatus,
        transaction_id: eghlResponse.PaymentID,
      },
      'Final status found at gateway. Finalizing',
    )

    // Sequential by design: payment finalization has DB side effects and should be throttled.
    // oxlint-disable-next-line no-await-in-loop
    const finalizationResult = await recordOutcome(deps, eghlResponse, finalStatus)

    if (finalizationResult.isErr()) {
      logInfraFailure(logger, 'eghl.cron', finalizationResult.error, {
        transaction_id: eghlResponse.PaymentID,
      })
      errorCount++
      continue
    }

    if (finalizationResult.value.finalized) {
      finalizedCount++
    }
  }

  // Batch update all transactions that need to be marked as failed
  if (transactionsToMarkFailed.length > 0) {
    const marked = await db.run(markPendingTransactionsFailed(transactionsToMarkFailed))
    if (marked.isErr()) {
      logInfraFailure(logger, 'eghl.cron', marked.error, {
        count: transactionsToMarkFailed.length,
        sampleIds: transactionsToMarkFailed.slice(0, 10),
      })
      errorCount += transactionsToMarkFailed.length
    } else {
      failCount = marked.value
    }
  }

  logger.info(
    {
      event: LOG_EVENTS.COMPLETE,
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
