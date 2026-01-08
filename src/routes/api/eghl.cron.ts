import { createFileRoute } from '@tanstack/react-router'
import { and, eq, gt, inArray, lt } from 'drizzle-orm'

import {
  addDays,
  addMinutes,
  differenceInMinutes,
  isBefore,
  now,
} from '#/core/date'
import { transactions } from '#/db/schema'
import { CRON_SECRET } from '#/envvars'
import {
  EghlTxnExists,
  EghlTxnStatus,
} from '#/features/payment-gateway/eghl.schema'
import {
  dbMiddleware,
  eghlServiceMiddleware,
  paymentServiceMiddleware,
} from '#/server/middleware'

const LOG_EVENTS = {
  JOB_START: 'eghl.cron.job_info',
  UNAUTHORIZED: 'eghl.cron.unauthorized',
  QUERY_FAILED: 'eghl.cron.query_failed',
  NOT_EXISTS: 'eghl.cron.not_exists',
  STILL_PENDING: 'eghl.cron.still_pending',
  SYNCING_STATUS: 'eghl.cron.syncing_status',
  FINALIZATION_FAILED: 'eghl.cron.finalization_failed',
  COMPLETE: 'eghl.cron.complete',
}

export const Route = createFileRoute('/api/eghl/cron')({
  server: {
    middleware: [eghlServiceMiddleware, dbMiddleware, paymentServiceMiddleware],
    handlers: {
      GET: async ({ request, context }) => {
        const { eghlService, paymentService, logger, db } = context
        const authHeader = request.headers.get('authorization')

        if (authHeader !== `Bearer ${CRON_SECRET}`) {
          logger.warn(
            { event: LOG_EVENTS.UNAUTHORIZED },
            'Unauthorized cron job attempt',
          )
          return new Response('Unauthorized', { status: 401 })
        }

        const pendingTransactions = await db
          .select({
            transactionId: transactions.id,
            amountInCents: transactions.amount,
            createdAt: transactions.createdAt,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.status, 'pending'),
              // between 15 minutes ago and 2 days ago
              lt(transactions.createdAt, addMinutes(now(), -15)),
              gt(transactions.createdAt, addDays(now(), -2)),
            ),
          )

        logger.info({ event: LOG_EVENTS.JOB_START }, 'Starting eGHL cron job')

        let finalizedCount = 0
        let failCount = 0
        let errorCount = 0

        // Collect transaction IDs to mark as failed for batch update
        const transactionsToMarkFailed: string[] = []

        for (const pendingTransaction of pendingTransactions) {
          const result = await eghlService.queryTransactionStatus({
            transactionId: pendingTransaction.transactionId,
            amountInCents: pendingTransaction.amountInCents,
          })

          if (!result.ok) {
            logger.error(
              {
                event: LOG_EVENTS.QUERY_FAILED,
                error_type: result.error.type,
                err: 'error' in result.error ? result.error.error : undefined,
                transaction_id: pendingTransaction.transactionId,
              },
              'Failed to query eGHL status',
            )
            errorCount++
            continue
          }

          const eghlResponse = result.value

          // Transaction not found at eGHL
          if (eghlResponse.TxnExists === EghlTxnExists.NotFound) {
            // SAFEGUARD: Only mark as failed if it's older than 30 minutes.
            // This accounts for the 10-minute gateway timeout + buffers.
            if (
              isBefore(pendingTransaction.createdAt, addMinutes(now(), -30))
            ) {
              const ageMinutes = differenceInMinutes(
                now(),
                pendingTransaction.createdAt,
              )

              logger.info(
                {
                  event: LOG_EVENTS.NOT_EXISTS,
                  transaction_id: pendingTransaction.transactionId,
                  age_minutes: ageMinutes,
                },
                'Transaction not found in eGHL. Marking as failed locally',
              )

              transactionsToMarkFailed.push(pendingTransaction.transactionId)
              failCount++
            }
            continue
          }

          // Still pending at eGHL
          if (eghlResponse.TxnStatus === EghlTxnStatus.Pending) {
            logger.info(
              {
                event: LOG_EVENTS.STILL_PENDING,
                transaction_id: eghlResponse.PaymentID,
              },
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

          const finalizationResult =
            await paymentService.finalizePaymentFromCallback(eghlResponse)

          if (!finalizationResult.ok) {
            logger.error(
              {
                event: LOG_EVENTS.FINALIZATION_FAILED,
                transaction_id: eghlResponse.PaymentID,
                err: finalizationResult.error.error,
                error_type: finalizationResult.error.type,
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
          await db
            .update(transactions)
            .set({ status: 'failed' })
            .where(inArray(transactions.id, transactionsToMarkFailed))
        }

        logger.info(
          {
            event: LOG_EVENTS.COMPLETE,
            stats: {
              found: pendingTransactions.length,
              finalized: finalizedCount,
              marked_failed: failCount,
              errors: errorCount,
            },
          },
          'eGHL cron job complete',
        )

        return new Response('ok', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        })
      },
    },
  },
})
