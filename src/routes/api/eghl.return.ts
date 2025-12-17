import { createFileRoute, redirect } from '@tanstack/react-router'

import { assertExhaustive } from '#/core/assert-exhaustive'
import { EghlTxnStatus } from '#/features/payment-gateway/eghl.schema'
import {
  eghlServiceMiddleware,
  paymentServiceMiddleware,
} from '#/server/middleware'

import { parseAndVerifyEghlResponse } from './-eghl.shared'

export const Route = createFileRoute('/api/eghl/return')({
  server: {
    middleware: [paymentServiceMiddleware, eghlServiceMiddleware],
    handlers: {
      POST: async ({ request, context }) => {
        const { eghlService, paymentService, logger } = context

        logger.info(
          { event: 'eghl.return.received', method: 'POST' },
          'Received eGHL return redirect',
        )

        const errorRedirect = redirect({ to: '/uh-oh', replace: true })

        const responseResult = await parseAndVerifyEghlResponse(
          request,
          eghlService,
        )

        if (!responseResult.ok) {
          const { type } = responseResult.error

          switch (type) {
            case 'ParseError': {
              logger.warn(
                {
                  event: 'eghl.return.validation_failed',
                  err: responseResult.error.error,
                  error_type: responseResult.error.type,
                },
                'Return payload validation failed',
              )
              break
            }
            case 'EGHL_VERIFICATION_ERROR': {
              logger.error(
                { event: 'eghl.return.verification_failed' },
                'Signature verification failed (Potential tampering)',
              )
              break
            }
            case 'INVALID_METHOD': {
              logger.warn(
                { event: 'eghl.return.method_invalid' },
                'Invalid HTTP method received',
              )
              break
            }
            case 'SERVER_ERROR': {
              logger.error(
                { event: 'eghl.return.read_failed' },
                'Failed to read request body',
              )
              break
            }
            default: {
              assertExhaustive(responseResult.error)
            }
          }

          return errorRedirect
        }

        const eghlResponse = responseResult.value

        logger.info(
          {
            event: 'eghl.return.processing',
            transaction_id: eghlResponse.PaymentID,
            provider_txn_id: eghlResponse.TxnID,
            amount: eghlResponse.Amount,
            status: eghlResponse.TxnStatus,
          },
          'Signature verified, processing payment finalization',
        )

        const finalizationResult =
          await paymentService.finalizePaymentFromCallback(eghlResponse)

        if (!finalizationResult.ok) {
          logger.error(
            {
              event: 'eghl.return.finalization_failed',
              transaction_id: eghlResponse.PaymentID,
              err: finalizationResult.error.error,
              error_type: finalizationResult.error.type,
            },
            'Failed to record payment outcome in database',
          )
          return errorRedirect
        }

        logger.info(
          {
            event: 'eghl.return.success',
            transaction_id: eghlResponse.PaymentID,
          },
          'Callback processed and saved successfully',
        )

        throw redirect({
          to: '/transaction/receipt/$transactionId',
          params: { transactionId: eghlResponse.PaymentID },
          replace: true,
        })
      },
      GET: async ({ request, context }) => {
        const { eghlService, paymentService, logger } = context

        logger.info(
          { event: 'eghl.return.received', method: 'GET' },
          'Received eGHL return redirect',
        )

        const errorRedirect = redirect({ to: '/uh-oh', replace: true })

        const responseResult = await parseAndVerifyEghlResponse(
          request,
          eghlService,
        )

        if (!responseResult.ok) {
          const { type } = responseResult.error

          switch (type) {
            case 'ParseError': {
              logger.warn(
                {
                  event: 'eghl.return.validation_failed',
                  err: responseResult.error.error,
                  error_type: responseResult.error.type,
                },
                'Return payload validation failed',
              )
              break
            }
            case 'EGHL_VERIFICATION_ERROR': {
              logger.error(
                { event: 'eghl.return.verification_failed' },
                'Signature verification failed (Potential tampering)',
              )
              break
            }
            case 'INVALID_METHOD': {
              logger.warn(
                { event: 'eghl.return.method_invalid' },
                'Invalid HTTP method received',
              )
              break
            }
            case 'SERVER_ERROR': {
              logger.error(
                { event: 'eghl.return.read_failed' },
                'Failed to read request body',
              )
              break
            }
            default: {
              assertExhaustive(responseResult.error)
            }
          }

          return errorRedirect
        }

        const eghlResponse = responseResult.value

        const message = eghlResponse.TxnMessage.toLowerCase()
        const isTerminalStateFromGateway =
          eghlResponse.TxnStatus === EghlTxnStatus.Failed &&
          (message.includes('cancel') ||
            message.includes('duplicate payment id'))

        if (isTerminalStateFromGateway) {
          logger.info(
            {
              event: 'eghl.return.processing_terminal_state',
              transaction_id: eghlResponse.PaymentID,
            },
            'Processing terminal failure state from GET return',
          )
          const finalizationResult =
            await paymentService.finalizePaymentFromCallback(eghlResponse)

          if (!finalizationResult.ok) {
            logger.error(
              {
                event: 'eghl.return.finalization_failed',
                transaction_id: eghlResponse.PaymentID,
                err: finalizationResult.error.error,
                error_type: finalizationResult.error.type,
              },
              'Failed to record payment outcome in database',
            )
            throw errorRedirect
          }
        }

        logger.info(
          {
            event: 'eghl.return.success',
            transaction_id: eghlResponse.PaymentID,
          },
          'Callback processed and saved successfully',
        )

        throw redirect({
          to: '/transaction/receipt/$transactionId',
          params: { transactionId: eghlResponse.PaymentID },
          replace: true,
        })
      },
    },
  },
})
