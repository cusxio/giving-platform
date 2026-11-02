import { redirect } from '@tanstack/react-router'

import type { Deps } from '#/server/deps.server'
import { logDefects, logInfraFailure } from '#/server/procedure.server'

import type { EghlReplyError } from './eghl.errors'
import { replyRecord } from './payment-outcome'
import { settleReply } from './settlement.server'

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

  const finalizationResult = await settleReply(deps, reply, 'callback')

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

  const finalizationResult = await settleReply(deps, reply, 'return')

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

  const finalizationResult = await settleReply(deps, reply, 'return')

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
