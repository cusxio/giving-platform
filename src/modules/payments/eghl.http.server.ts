import { redirect } from '@tanstack/react-router'
import { Result } from 'better-result'

import { assertExhaustive } from '#/core/assert-exhaustive'
import type { Deps } from '#/server/deps.server'
import type { InfraError } from '#/server/infra-error'
import { logDefects, logInfraFailure } from '#/server/procedure.server'

import type { EghlReplyError } from './eghl.errors'
import { EghlGatewayBusyError } from './eghl.errors'
import type { GatewayReply, PaymentRecord } from './payment-outcome'
import { replyRecord } from './payment-outcome'
import type { Recorded } from './record-outcome.server'
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

type Settled = Recorded | { readonly kind: 'waiting' }
type Settlement = Promise<Result<Settled, InfraError>>

/** The transaction stays pending; nothing was written. */
const WAITING: Settled = { kind: 'waiting' }

/** Settles a verified callback or return reply, leaving the transaction pending when unsure. */
async function settleInboundReply(deps: SettlementDeps, reply: GatewayReply): Settlement {
  const { logger } = deps

  switch (reply.kind) {
    case 'settled': {
      return recordOutcome(deps, reply.outcome)
    }
    case 'unconfirmed': {
      return confirmByQuery(deps, reply.claim.record.transactionId)
    }
    case 'pending': {
      logger.info(
        { event: 'eghl.settlement.not_final', transaction_id: reply.record.transactionId },
        'Reply does not settle the transaction, leaving it pending',
      )
      return Result.ok(WAITING)
    }
    default: {
      return assertExhaustive(reply)
    }
  }
}

function leftPending(deps: SettlementDeps, transactionId: PaymentRecord['transactionId']) {
  deps.logger.info(
    { event: 'eghl.settlement.not_final', transaction_id: transactionId },
    'Gateway status does not settle the transaction, leaving it pending',
  )
  return Result.ok(WAITING)
}

async function confirmByQuery(
  deps: SettlementDeps,
  transactionId: PaymentRecord['transactionId'],
): Settlement {
  const { eghl, logger } = deps
  const amountResult = await deps.db.run(findPendingAmountInCents(transactionId))
  if (amountResult.isErr()) {
    return Result.err(amountResult.error)
  }
  if (amountResult.value === undefined) {
    return Result.ok(WAITING)
  }

  const queryResult = await eghl.queryStatus({ amountInCents: amountResult.value, transactionId })
  if (queryResult.isErr()) {
    if (EghlGatewayBusyError.is(queryResult.error)) {
      return leftPending(deps, transactionId)
    }
    logger.warn(
      {
        'error.type': queryResult.error._tag,
        event: 'eghl.settlement.query_failed',
        transaction_id: transactionId,
      },
      'Could not confirm the reply with the gateway, leaving it pending',
    )
    return Result.ok(WAITING)
  }

  const outcome = queryResult.value
  switch (outcome.kind) {
    case 'succeeded':
    case 'failed': {
      return recordOutcome(deps, outcome)
    }
    case 'pending':
    case 'notFound': {
      return leftPending(deps, transactionId)
    }
    default: {
      return assertExhaustive(outcome)
    }
  }
}

async function callback(deps: SettlementDeps, request: Request) {
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

  const reply = responseResult.value
  const record = replyRecord(reply)

  logger.info(
    {
      amount_in_cents: record.amountInCents,
      event: 'eghl.callback.processing',
      provider_txn_id: record.providerTxnId,
      transaction_id: record.transactionId,
    },
    'Signature verified, processing payment finalization',
  )

  const finalizationResult = await settleInboundReply(deps, reply)

  if (finalizationResult.isErr()) {
    logInfraFailure(logger, 'eghl.callback', finalizationResult.error, {
      transaction_id: record.transactionId,
    })
    return internalError
  }

  logger.info(
    { event: 'eghl.callback.success', transaction_id: record.transactionId },
    'Callback processed and saved successfully',
  )

  // eGHL resends the callback, up to 3 times, until it reads this exact body.
  return new Response('OK', { headers: { 'Content-Type': 'text/plain' }, status: 200 })
}

// The GET and POST returns differ in their processing log and in how a failed write redirects,
// so they stay two functions.
async function returnGet(deps: SettlementDeps, request: Request) {
  const { eghl, logger } = deps

  logger.info({ event: 'eghl.return.received', method: 'GET' }, 'Received eGHL return redirect')

  const errorRedirect = redirect({ replace: true, to: '/uh-oh' })

  const responseResult = await eghl.readReply(request)

  if (responseResult.isErr()) {
    refuseReply(logger, 'return', responseResult.error)
    return errorRedirect
  }

  const reply = responseResult.value
  const record = replyRecord(reply)

  logger.info(
    { event: 'eghl.return.processing', transaction_id: record.transactionId },
    'Signature verified, processing GET return',
  )

  const finalizationResult = await settleInboundReply(deps, reply)

  if (finalizationResult.isErr()) {
    logInfraFailure(logger, 'eghl.return', finalizationResult.error, {
      transaction_id: record.transactionId,
    })
    throw errorRedirect
  }

  logger.info(
    { event: 'eghl.return.success', transaction_id: record.transactionId },
    'Callback processed and saved successfully',
  )

  throw redirect({
    params: { transactionId: record.transactionId },
    replace: true,
    to: '/transaction/receipt/$transactionId',
  })
}

async function returnPost(deps: SettlementDeps, request: Request) {
  const { eghl, logger } = deps

  logger.info({ event: 'eghl.return.received', method: 'POST' }, 'Received eGHL return redirect')

  const errorRedirect = redirect({ replace: true, to: '/uh-oh' })

  const responseResult = await eghl.readReply(request)

  if (responseResult.isErr()) {
    refuseReply(logger, 'return', responseResult.error)
    return errorRedirect
  }

  const reply = responseResult.value
  const record = replyRecord(reply)

  logger.info(
    {
      amount_in_cents: record.amountInCents,
      event: 'eghl.return.processing',
      provider_txn_id: record.providerTxnId,
      transaction_id: record.transactionId,
    },
    'Signature verified, processing payment finalization',
  )

  const finalizationResult = await settleInboundReply(deps, reply)

  if (finalizationResult.isErr()) {
    logInfraFailure(logger, 'eghl.return', finalizationResult.error, {
      transaction_id: record.transactionId,
    })
    return errorRedirect
  }

  logger.info(
    { event: 'eghl.return.success', transaction_id: record.transactionId },
    'Callback processed and saved successfully',
  )

  throw redirect({
    params: { transactionId: record.transactionId },
    replace: true,
    to: '/transaction/receipt/$transactionId',
  })
}

export const handleEghlCallback = (deps: SettlementDeps, request: Request) =>
  logDefects(deps.logger, 'eghl.callback', () => callback(deps, request))

export const handleEghlReturnGet = (deps: SettlementDeps, request: Request) =>
  logDefects(deps.logger, 'eghl.return', () => returnGet(deps, request))

export const handleEghlReturnPost = (deps: SettlementDeps, request: Request) =>
  logDefects(deps.logger, 'eghl.return', () => returnPost(deps, request))
