import { redirect } from '@tanstack/react-router'

import { assertExhaustive } from '#/core/assert-exhaustive'
import { createDBError } from '#/core/errors'
import { ok, tryAsync } from '#/core/result'
import type { Deps } from '#/server/deps.server'

import { finalStatusOf, inboundActionOf } from './eghl.outcome'
import type { EghlPaymentResponse } from './eghl.wire'
import { recordOutcome } from './record-outcome.server'
import { findPendingAmountInCents } from './transactions.repository.server'

type SettlementDeps = Pick<Deps, 'db' | 'eghl' | 'logger'>

/** Settles a verified callback or return reply, leaving the transaction pending when unsure. */
async function settleInboundReply(deps: SettlementDeps, reply: EghlPaymentResponse) {
  const { logger } = deps
  const action = inboundActionOf(reply)

  switch (action) {
    case 'settle-success': {
      return recordOutcome(deps, reply, 'success')
    }
    case 'confirm-by-query': {
      return confirmByQuery(deps, reply.PaymentID)
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
  deps: SettlementDeps,
  transactionId: EghlPaymentResponse['PaymentID'],
) {
  const { eghl, logger } = deps
  const amountResult = await tryAsync(
    () => deps.db.run(findPendingAmountInCents(transactionId)),
    createDBError,
  )
  if (!amountResult.ok) {
    return amountResult
  }
  if (amountResult.value === undefined) {
    return ok({ finalized: false })
  }

  const queryResult = await eghl.queryStatus({ amountInCents: amountResult.value, transactionId })
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

  return recordOutcome(deps, queryResult.value, finalStatus)
}

export async function handleEghlCallback(deps: SettlementDeps, request: Request) {
  const { eghl, logger } = deps
  const internalError = Response.json({ message: 'Internal Server Error' }, { status: 500 })
  const badRequest = Response.json({ message: 'Bad Request' }, { status: 400 })

  logger.info({ event: 'eghl.callback.received' }, 'Received eGHL callback')

  const responseResult = await eghl.readReply(request)

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

  const finalizationResult = await settleInboundReply(deps, eghlResponse)

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

  // eGHL resends the callback, up to 3 times, until it reads this exact body.
  return new Response('OK', { headers: { 'Content-Type': 'text/plain' }, status: 200 })
}

// The GET and POST returns differ in their processing log and in how a failed write redirects,
// so they stay two functions.
export async function handleEghlReturnGet(deps: SettlementDeps, request: Request) {
  const { eghl, logger } = deps

  logger.info({ event: 'eghl.return.received', method: 'GET' }, 'Received eGHL return redirect')

  const errorRedirect = redirect({ replace: true, to: '/uh-oh' })

  const responseResult = await eghl.readReply(request)

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
      event: 'eghl.return.processing',
      status: eghlResponse.TxnStatus,
      transaction_id: eghlResponse.PaymentID,
    },
    'Signature verified, processing GET return',
  )

  const finalizationResult = await settleInboundReply(deps, eghlResponse)

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

  logger.info(
    { event: 'eghl.return.success', transaction_id: eghlResponse.PaymentID },
    'Callback processed and saved successfully',
  )

  throw redirect({
    params: { transactionId: eghlResponse.PaymentID },
    replace: true,
    to: '/transaction/receipt/$transactionId',
  })
}

export async function handleEghlReturnPost(deps: SettlementDeps, request: Request) {
  const { eghl, logger } = deps

  logger.info({ event: 'eghl.return.received', method: 'POST' }, 'Received eGHL return redirect')

  const errorRedirect = redirect({ replace: true, to: '/uh-oh' })

  const responseResult = await eghl.readReply(request)

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

  const finalizationResult = await settleInboundReply(deps, eghlResponse)

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
}
