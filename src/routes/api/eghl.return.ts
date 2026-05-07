import { createFileRoute, redirect } from '@tanstack/react-router'

import { assertExhaustive } from '#/core/assert-exhaustive'
import { EghlTxnStatus } from '#/features/payment-gateway/eghl.schema'
import { eghlServiceMiddleware } from '#/server/middleware/eghl-service-middleware'
import { paymentServiceMiddleware } from '#/server/middleware/payment-service-middleware'

import { parseAndVerifyEghlResponse } from './-eghl.shared'

export const Route = createFileRoute('/api/eghl/return')({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        const { eghlService, paymentService, logger } = context

        logger.info(
          { event: 'eghl.return.received', method: 'GET' },
          'Received eGHL return redirect',
        )

        const errorRedirect = redirect({ replace: true, to: '/uh-oh' })

        const responseResult = await parseAndVerifyEghlResponse(request, eghlService)

        if (!responseResult.ok) {
          const { type } = responseResult.error

          switch (type) {
            case 'ParseError': {
              logger.warn(
                {
                  err: responseResult.error.error,
                  error_type: responseResult.error.type,
                  event: 'eghl.return.validation_failed',
                },
                'Return payload validation failed',
              )
              break
            }
            case 'EghlVerificationError': {
              logger.error(
                { event: 'eghl.return.verification_failed' },
                'Signature verification failed (Potential tampering)',
              )
              break
            }
            case 'EghlInvalidMethodError': {
              logger.warn({ event: 'eghl.return.method_invalid' }, 'Invalid HTTP method received')
              break
            }
            case 'EghlServerError': {
              logger.error({ event: 'eghl.return.read_failed' }, 'Failed to read request body')
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
          (message.includes('cancel') || message.includes('duplicate payment id'))

        if (isTerminalStateFromGateway) {
          logger.info(
            {
              event: 'eghl.return.processing_terminal_state',
              transaction_id: eghlResponse.PaymentID,
            },
            'Processing terminal failure state from GET return',
          )
          const finalizationResult = await paymentService.finalizePaymentFromCallback(eghlResponse)

          if (!finalizationResult.ok) {
            logger.error(
              {
                err: finalizationResult.error.error,
                error_type: finalizationResult.error.type,
                event: 'eghl.return.finalization_failed',
                transaction_id: eghlResponse.PaymentID,
              },
              'Failed to record payment outcome in database',
            )
            throw errorRedirect
          }
        }

        logger.info(
          { event: 'eghl.return.success', transaction_id: eghlResponse.PaymentID },
          'Callback processed and saved successfully',
        )

        throw redirect({
          params: { transactionId: eghlResponse.PaymentID },
          replace: true,
          to: '/transaction/receipt/$transactionId',
        })
      },
      POST: async ({ request, context }) => {
        const { eghlService, paymentService, logger } = context

        logger.info(
          { event: 'eghl.return.received', method: 'POST' },
          'Received eGHL return redirect',
        )

        const errorRedirect = redirect({ replace: true, to: '/uh-oh' })

        const responseResult = await parseAndVerifyEghlResponse(request, eghlService)

        if (!responseResult.ok) {
          const { type } = responseResult.error

          switch (type) {
            case 'ParseError': {
              logger.warn(
                {
                  err: responseResult.error.error,
                  error_type: responseResult.error.type,
                  event: 'eghl.return.validation_failed',
                },
                'Return payload validation failed',
              )
              break
            }
            case 'EghlVerificationError': {
              logger.error(
                { event: 'eghl.return.verification_failed' },
                'Signature verification failed (Potential tampering)',
              )
              break
            }
            case 'EghlInvalidMethodError': {
              logger.warn({ event: 'eghl.return.method_invalid' }, 'Invalid HTTP method received')
              break
            }
            case 'EghlServerError': {
              logger.error({ event: 'eghl.return.read_failed' }, 'Failed to read request body')
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
            amount: eghlResponse.Amount,
            event: 'eghl.return.processing',
            provider_txn_id: eghlResponse.TxnID,
            status: eghlResponse.TxnStatus,
            transaction_id: eghlResponse.PaymentID,
          },
          'Signature verified, processing payment finalization',
        )

        const finalizationResult = await paymentService.finalizePaymentFromCallback(eghlResponse)

        if (!finalizationResult.ok) {
          logger.error(
            {
              err: finalizationResult.error.error,
              error_type: finalizationResult.error.type,
              event: 'eghl.return.finalization_failed',
              transaction_id: eghlResponse.PaymentID,
            },
            'Failed to record payment outcome in database',
          )
          return errorRedirect
        }

        logger.info(
          { event: 'eghl.return.success', transaction_id: eghlResponse.PaymentID },
          'Callback processed and saved successfully',
        )

        throw redirect({
          params: { transactionId: eghlResponse.PaymentID },
          replace: true,
          to: '/transaction/receipt/$transactionId',
        })
      },
    },
    middleware: [paymentServiceMiddleware, eghlServiceMiddleware],
  },
})
