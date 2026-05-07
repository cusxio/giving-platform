import { createFileRoute } from '@tanstack/react-router'
import { and, asc, eq, gt, inArray, lt } from 'drizzle-orm'

import { addDays, addMinutes, differenceInMinutes, isBefore, now } from '#/core/date'
import { transactions } from '#/db/schema'
import { CRON_SECRET } from '#/envvars'
import { EghlTxnExists, EghlTxnStatus } from '#/features/payment-gateway/eghl.schema'
import { dbMiddleware } from '#/server/middleware/db-middleware'
import { eghlServiceMiddleware } from '#/server/middleware/eghl-service-middleware'
import { paymentServiceMiddleware } from '#/server/middleware/payment-service-middleware'

const LOG_EVENTS = {
  BATCH_UPDATE_FAILED: 'eghl.cron.batch_update_failed',
  COMPLETE: 'eghl.cron.complete',
  FINALIZATION_FAILED: 'eghl.cron.finalization_failed',
  JOB_START: 'eghl.cron.job_start',
  NOT_EXISTS: 'eghl.cron.not_exists',
  QUERY_FAILED: 'eghl.cron.query_failed',
  STILL_PENDING: 'eghl.cron.still_pending',
  SYNCING_STATUS: 'eghl.cron.syncing_status',
  UNAUTHORIZED: 'eghl.cron.unauthorized',
}

export const Route = createFileRoute('/api/eghl/cron')({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const { eghlService, paymentService, logger, db } = context
        const authHeader = request.headers.get('authorization')

        if (CRON_SECRET === undefined || authHeader !== `Bearer ${CRON_SECRET}`) {
          logger.warn({ event: LOG_EVENTS.UNAUTHORIZED }, 'Unauthorized cron job attempt')
          return new Response('Unauthorized', { status: 401 })
        }

        logger.info({ event: LOG_EVENTS.JOB_START }, 'Starting eGHL cron job')

        let pendingTransactions
        try {
          pendingTransactions = await db
            .select({
              amountInCents: transactions.amount,
              createdAt: transactions.createdAt,
              transactionId: transactions.id,
            })
            .from(transactions)
            .where(
              and(
                eq(transactions.status, 'pending'),
                // Between 15 minutes ago and 2 days ago
                lt(transactions.createdAt, addMinutes(now(), -15)),
                gt(transactions.createdAt, addDays(now(), -2)),
              ),
            )
            .orderBy(asc(transactions.createdAt))
            .limit(25)
        } catch (error: unknown) {
          logger.error(
            { err: error, event: LOG_EVENTS.QUERY_FAILED },
            'Failed to fetch pending transactions',
          )
          return new Response('Internal Server Error', { status: 500 })
        }

        let finalizedCount = 0
        let failCount = 0
        let errorCount = 0

        // Collect transaction IDs to mark as failed for batch update
        const transactionsToMarkFailed: string[] = []

        for (const pendingTransaction of pendingTransactions) {
          // Sequential by design: avoid concurrent requests to eGHL/payment finalization side effects.
          // oxlint-disable-next-line no-await-in-loop
          const result = await eghlService.queryTransactionStatus({
            amountInCents: pendingTransaction.amountInCents,
            transactionId: pendingTransaction.transactionId,
          })

          if (!result.ok) {
            logger.error(
              {
                err: 'error' in result.error ? result.error.error : undefined,
                error_type: result.error.type,
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

          // Still pending at eGHL
          if (eghlResponse.TxnStatus === EghlTxnStatus.Pending) {
            logger.info(
              { event: LOG_EVENTS.STILL_PENDING, transaction_id: eghlResponse.PaymentID },
              'Transaction is still pending at payment gateway. Skipping',
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
          const finalizationResult = await paymentService.finalizePaymentFromCallback(eghlResponse)

          if (!finalizationResult.ok) {
            logger.error(
              {
                err: finalizationResult.error.error,
                error_type: finalizationResult.error.type,
                event: LOG_EVENTS.FINALIZATION_FAILED,
                transaction_id: eghlResponse.PaymentID,
              },
              'Failed to record payment outcome in database',
            )
            errorCount++
            continue
          }

          if (finalizationResult.value.finalized) {
            finalizedCount++
          }
        }

        // Batch update all transactions that need to be marked as failed
        if (transactionsToMarkFailed.length > 0) {
          try {
            const result = await db
              .update(transactions)
              .set({ status: 'failed' })
              .where(
                and(
                  inArray(transactions.id, transactionsToMarkFailed),
                  eq(transactions.status, 'pending'),
                ),
              )
            failCount = result.rowCount
          } catch (error: unknown) {
            logger.error(
              {
                count: transactionsToMarkFailed.length,
                err: error,
                event: LOG_EVENTS.BATCH_UPDATE_FAILED,
                sampleIds: transactionsToMarkFailed.slice(0, 10),
              },
              'Failed to mark transactions as failed',
            )
            errorCount += transactionsToMarkFailed.length
            failCount = 0
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
      },
    },
    middleware: [eghlServiceMiddleware, dbMiddleware, paymentServiceMiddleware],
  },
})
