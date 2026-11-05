import type { Logger } from 'pino'
import queryString from 'query-string'

import { assertExhaustive } from '#/core/assert-exhaustive'
import { createParseError } from '#/core/errors'
import type { Result } from '#/core/result'
import { err, ok, tryAsync, trySync } from '#/core/result'
import type { PaymentService } from '#/features/giving/payment.service'
import type { EghlCallbackError } from '#/features/payment-gateway/eghl.errors'
import { finalStatusOf, inboundActionOf } from '#/features/payment-gateway/eghl.finality'
import type { EghlPaymentResponse } from '#/features/payment-gateway/eghl.schema'
import { EghlPaymentResponseSchema } from '#/features/payment-gateway/eghl.schema'
import type { EghlService } from '#/features/payment-gateway/eghl.service'

export async function parseAndVerifyEghlResponse(
  request: Request,
  eghlService: EghlService,
): Promise<Result<EghlPaymentResponse, EghlCallbackError>> {
  let raw: string

  if (request.method === 'GET') {
    raw = new URL(request.url).search
  } else if (request.method === 'POST') {
    const bodyResult = await tryAsync(
      () => request.text(),
      () => ({ type: 'EghlServerError' }),
    )

    if (!bodyResult.ok) {
      return bodyResult
    }
    raw = bodyResult.value
  } else {
    return err({ type: 'EghlInvalidMethodError' })
  }

  const qsResult = trySync(
    () => queryString.parse(raw),
    () => ({ type: 'EghlServerError' }),
  )
  if (!qsResult.ok) {
    return qsResult
  }

  const parseResult = trySync(
    () => EghlPaymentResponseSchema.Parse(qsResult.value),
    createParseError,
  )
  if (!parseResult.ok) {
    return parseResult
  }

  const eghlResponse = parseResult.value

  if (!eghlService.verifyPaymentResponse(eghlResponse)) {
    return err({ type: 'EghlVerificationError' })
  }

  return ok(eghlResponse)
}

interface InboundSettlementContext {
  readonly eghlService: EghlService
  readonly logger: Logger
  readonly paymentService: PaymentService
}

/** Settles a verified callback or return reply, leaving the transaction pending when unsure. */
export async function settleInboundReply(
  reply: EghlPaymentResponse,
  context: InboundSettlementContext,
) {
  const { logger, paymentService } = context
  const action = inboundActionOf(reply)

  switch (action) {
    case 'settle-success': {
      return paymentService.finalizePaymentFromCallback(reply, 'success')
    }
    case 'confirm-by-query': {
      return confirmByQuery(reply.PaymentID, context)
    }
    case 'leave-pending': {
      logger.info(
        { event: 'eghl.settlement.not_final', transaction_id: reply.PaymentID },
        'Reply does not settle the transaction, leaving it pending',
      )
      return ok({ finalized: false })
    }
    default: {
      return assertExhaustive(action)
    }
  }
}

async function confirmByQuery(
  transactionId: EghlPaymentResponse['PaymentID'],
  { eghlService, logger, paymentService }: InboundSettlementContext,
) {
  const amountResult = await paymentService.findPendingAmountInCents(transactionId)
  if (!amountResult.ok) {
    return amountResult
  }
  if (amountResult.value === undefined) {
    return ok({ finalized: false })
  }

  const queryResult = await eghlService.queryTransactionStatus({
    amountInCents: amountResult.value,
    transactionId,
  })
  if (!queryResult.ok) {
    logger.warn(
      {
        error_type: queryResult.error.type,
        event: 'eghl.settlement.query_failed',
        transaction_id: transactionId,
      },
      'Could not confirm the reply with the gateway, leaving it pending',
    )
    return ok({ finalized: false })
  }

  const finalStatus = finalStatusOf(queryResult.value)
  if (finalStatus === null) {
    logger.info(
      {
        event: 'eghl.settlement.not_final',
        status: queryResult.value.TxnStatus,
        transaction_id: transactionId,
      },
      'Gateway status does not settle the transaction, leaving it pending',
    )
    return ok({ finalized: false })
  }

  return paymentService.finalizePaymentFromCallback(queryResult.value, finalStatus)
}
