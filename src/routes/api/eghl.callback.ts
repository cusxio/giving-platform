import { createFileRoute } from '@tanstack/react-router'

import { assertExhaustive } from '#/core/assert-exhaustive'
import {
  eghlServiceMiddleware,
  paymentServiceMiddleware,
} from '#/server/middleware'

import { parseAndVerifyEghlResponse } from './-eghl.shared'

export const Route = createFileRoute('/api/eghl/callback')({
  server: {
    middleware: [eghlServiceMiddleware, paymentServiceMiddleware],
    handlers: {
      POST: async ({ request, context }) => {
        const { eghlService, paymentService, logger } = context
        const internalError = Response.json(
          { message: 'Internal Server Error' },
          { status: 500 },
        )
        const badRequest = Response.json(
          { message: 'Bad Request' },
          { status: 400 },
        )

        logger.info(
          { event: 'eghl.callback.received' },
          'Received eGHL callback',
        )

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
                  event: 'eghl.callback.validation_failed',
                  err: responseResult.error.error,
                  error_type: responseResult.error.type,
                },
                'Callback payload validation failed',
              )
              return badRequest
            }
            case 'EGHL_VERIFICATION_ERROR': {
              logger.error(
                { event: 'eghl.callback.verification_failed' },
                'Signature verification failed (Potential tampering)',
              )
              return badRequest
            }
            case 'INVALID_METHOD': {
              logger.warn(
                { event: 'eghl.callback.method_invalid' },
                'Invalid HTTP method received',
              )
              return badRequest
            }
            case 'SERVER_ERROR': {
              logger.error(
                { event: 'eghl.callback.read_failed' },
                'Failed to read request body',
              )
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
            event: 'eghl.callback.processing',
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
              event: 'eghl.callback.finalization_failed',
              transaction_id: eghlResponse.PaymentID,
              err: finalizationResult.error.error,
              error_type: finalizationResult.error.type,
            },
            'Failed to record payment outcome in database',
          )
          return internalError
        }

        logger.info(
          {
            event: 'eghl.callback.success',
            transaction_id: eghlResponse.PaymentID,
          },
          'Callback processed and saved successfully',
        )

        return new Response('ok', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        })
      },
    },
  },
})
