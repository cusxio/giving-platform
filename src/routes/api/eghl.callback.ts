import { createFileRoute } from '@tanstack/react-router'

import { assertExhaustive } from '#/core/assert-exhaustive'
import { finalStatusOf } from '#/features/payment-gateway/eghl.finality'
import { eghlServiceMiddleware } from '#/server/middleware/eghl-service-middleware'
import { paymentServiceMiddleware } from '#/server/middleware/payment-service-middleware'

import { parseAndVerifyEghlResponse } from './-eghl.shared'

export const Route = createFileRoute('/api/eghl/callback')({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        const { eghlService, paymentService, logger } = context
        const internalError = Response.json({ message: 'Internal Server Error' }, { status: 500 })
        const badRequest = Response.json({ message: 'Bad Request' }, { status: 400 })

        logger.info({ event: 'eghl.callback.received' }, 'Received eGHL callback')

        const responseResult = await parseAndVerifyEghlResponse(request, eghlService)

        if (!responseResult.ok) {
          const { type } = responseResult.error
          switch (type) {
            case 'ParseError': {
              logger.warn(
                {
                  err: responseResult.error.error,
                  error_type: responseResult.error.type,
                  event: 'eghl.callback.validation_failed',
                },
                'Callback payload validation failed',
              )
              return badRequest
            }
            case 'EghlVerificationError': {
              logger.error(
                { event: 'eghl.callback.verification_failed' },
                'Signature verification failed (Potential tampering)',
              )
              return badRequest
            }
            case 'EghlInvalidMethodError': {
              logger.warn({ event: 'eghl.callback.method_invalid' }, 'Invalid HTTP method received')
              return badRequest
            }
            case 'EghlServerError': {
              logger.error({ event: 'eghl.callback.read_failed' }, 'Failed to read request body')
              return internalError
            }
            default: {
              assertExhaustive(responseResult.error)
            }
          }
        }

        const eghlResponse = responseResult.value

        logger.info(
          {
            amount: eghlResponse.Amount,
            event: 'eghl.callback.processing',
            provider_txn_id: eghlResponse.TxnID,
            status: eghlResponse.TxnStatus,
            transaction_id: eghlResponse.PaymentID,
          },
          'Signature verified, processing payment finalization',
        )

        // eGHL keeps resending the callback until it reads this exact body.
        const acknowledged = new Response('OK', {
          headers: { 'Content-Type': 'text/plain' },
          status: 200,
        })

        const finalStatus = finalStatusOf(eghlResponse)
        if (finalStatus === null) {
          logger.info(
            {
              event: 'eghl.callback.not_final',
              status: eghlResponse.TxnStatus,
              transaction_id: eghlResponse.PaymentID,
            },
            'Reply does not settle the transaction, leaving it pending',
          )
          return acknowledged
        }

        const finalizationResult = await paymentService.finalizePaymentFromCallback(
          eghlResponse,
          finalStatus,
        )

        if (!finalizationResult.ok) {
          logger.error(
            {
              err: finalizationResult.error.error,
              error_type: finalizationResult.error.type,
              event: 'eghl.callback.finalization_failed',
              transaction_id: eghlResponse.PaymentID,
            },
            'Failed to record payment outcome in database',
          )
          return internalError
        }

        logger.info(
          { event: 'eghl.callback.success', transaction_id: eghlResponse.PaymentID },
          'Callback processed and saved successfully',
        )

        return acknowledged
      },
    },
    middleware: [eghlServiceMiddleware, paymentServiceMiddleware],
  },
})
