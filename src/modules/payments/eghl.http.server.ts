import { redirect } from '@tanstack/react-router'
import { Result } from 'better-result'

import { assertExhaustive } from '#/core/assert-exhaustive'
import type { Deps } from '#/server/deps.server'
import type { InfraError } from '#/server/infra-error'
import { logInfraFailure } from '#/server/procedure.server'

import type { EghlReplyError } from './eghl.errors'
import { finalStatusOf, inboundActionOf } from './eghl.outcome'
import type { EghlPaymentResponse } from './eghl.wire'
import { recordOutcome } from './record-outcome.server'
import { findPendingAmountInCents } from './transactions.repository.server'

type SettlementDeps = Pick<Deps, 'db' | 'eghl' | 'logger'>

/**
 * Logs why `route` refused a reply. The status says whose fault it is: 400 for the reply, 500
 * when its body could not be read, so the gateway sends it again.
 */
function refuseReply(
  logger: Deps['logger'],
  route: 'callback' | 'return',
  error: EghlReplyError,
): 400 | 500 {
  return error.match<EghlReplyError, 400 | 500>({
    EghlInvalidMethodError: () => {
      logger.warn({ event: `eghl.${route}.method_invalid` }, 'Invalid HTTP method received')
      return 400
    },
    EghlServerError: () => {
      logger.error({ event: `eghl.${route}.read_failed` }, 'Failed to read request body')
      return 500
    },
    EghlVerificationError: () => {
      logger.error(
        { event: `eghl.${route}.verification_failed` },
        'Signature verification failed (Potential tampering)',
      )
      return 400
    },
    ParseError: ({ _tag, cause }) => {
      logger.warn(
        { 'error.type': _tag, err: cause, event: `eghl.${route}.validation_failed` },
        `${route === 'callback' ? 'Callback' : 'Return'} payload validation failed`,
      )
      return 400
    },
  })
}

type Settlement = Promise<Result<{ finalized: boolean }, InfraError>>

/** Settles a verified callback or return reply, leaving the transaction pending when unsure. */
async function settleInboundReply(deps: SettlementDeps, reply: EghlPaymentResponse): Settlement {
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
      return Result.ok({ finalized: false })
    }
    default: {
      return assertExhaustive(action)
    }
  }
}

async function confirmByQuery(
  deps: SettlementDeps,
  transactionId: EghlPaymentResponse['PaymentID'],
): Settlement {
  const { eghl, logger } = deps
  const amountResult = await deps.db.run(findPendingAmountInCents(transactionId))
  if (amountResult.isErr()) {
    return Result.err(amountResult.error)
  }
  if (amountResult.value === undefined) {
    return Result.ok({ finalized: false })
  }

  const queryResult = await eghl.queryStatus({ amountInCents: amountResult.value, transactionId })
  if (queryResult.isErr()) {
    logger.warn(
      {
        'error.type': queryResult.error._tag,
        event: 'eghl.settlement.query_failed',
        transaction_id: transactionId,
      },
      'Could not confirm the reply with the gateway, leaving it pending',
    )
    return Result.ok({ finalized: false })
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
    return Result.ok({ finalized: false })
  }

  return recordOutcome(deps, queryResult.value, finalStatus)
}

export async function handleEghlCallback(deps: SettlementDeps, request: Request) {
  const { eghl, logger } = deps
  const internalError = Response.json({ message: 'Internal Server Error' }, { status: 500 })
  const badRequest = Response.json({ message: 'Bad Request' }, { status: 400 })

  logger.info({ event: 'eghl.callback.received' }, 'Received eGHL callback')

  const responseResult = await eghl.readReply(request)

  if (responseResult.isErr()) {
    return refuseReply(logger, 'callback', responseResult.error) === 400
      ? badRequest
      : internalError
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

  if (finalizationResult.isErr()) {
    logInfraFailure(logger, 'eghl.callback', finalizationResult.error, {
      transaction_id: eghlResponse.PaymentID,
    })
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

  if (responseResult.isErr()) {
    refuseReply(logger, 'return', responseResult.error)
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

  if (finalizationResult.isErr()) {
    logInfraFailure(logger, 'eghl.return', finalizationResult.error, {
      transaction_id: eghlResponse.PaymentID,
    })
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

  if (responseResult.isErr()) {
    refuseReply(logger, 'return', responseResult.error)
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

  if (finalizationResult.isErr()) {
    logInfraFailure(logger, 'eghl.return', finalizationResult.error, {
      transaction_id: eghlResponse.PaymentID,
    })
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
