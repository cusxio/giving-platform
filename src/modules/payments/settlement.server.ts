import { Result } from 'better-result'

import { assertExhaustive } from '#/core/assert-exhaustive'
import { now } from '#/core/date'
import type { Deps } from '#/server/deps.server'
import type { InfraError } from '#/server/infra-error'

import type { EghlQueryError } from './eghl.errors'
import { EghlGatewayBusyError } from './eghl.errors'
import type { Decision, GatewayReply } from './payment-outcome'
import { decide } from './payment-outcome'
import type { Recorded, Source } from './record-outcome.server'
import { recordOutcome } from './record-outcome.server'
import { findPendingAmountInCents } from './transactions.repository.server'

type SettlementDeps = Pick<Deps, 'db' | 'eghl' | 'logger'>

type WaitReason =
  | Extract<Decision, { do: 'wait' }>['why']
  /** The transaction is no longer pending, or there is no such transaction. */
  | 'not_pending'
  /** The reply itself says the payment is still pending. */
  | 'reply_pending'

/** How one settlement ended. The cron counts from it; the callback and return only log. */
type Settled =
  | Recorded
  | { readonly error: EghlQueryError; readonly kind: 'query_failed' }
  | { readonly kind: 'waiting'; readonly why: WaitReason }

type Settlement = Promise<Result<Settled, InfraError>>

const waiting = (why: WaitReason): Result<Settled, InfraError> =>
  Result.ok({ kind: 'waiting', why })

const queryFailed = (error: EghlQueryError): Result<Settled, InfraError> =>
  Result.ok({ error, kind: 'query_failed' })

/** How a failed status query is logged: its tag, and the error behind it when there is one. */
const queryFailureFields = (error: Exclude<EghlQueryError, EghlGatewayBusyError>) =>
  error.match<
    Exclude<EghlQueryError, EghlGatewayBusyError>,
    { 'error.type': string; err?: unknown }
  >({
    EghlFetchError: ({ _tag, cause }) => ({ 'error.type': _tag, err: cause }),
    EghlQueryMismatchError: ({ _tag }) => ({ 'error.type': _tag }),
    EghlQueryResponseError: ({ _tag }) => ({ 'error.type': _tag }),
    EghlServerError: ({ _tag }) => ({ 'error.type': _tag }),
    EghlVerificationError: ({ _tag }) => ({ 'error.type': _tag }),
    ParseError: ({ _tag, cause }) => ({ 'error.type': _tag, err: cause }),
  })

function logGatewayLeftPending(deps: SettlementDeps, transactionId: string) {
  deps.logger.info(
    { event: 'eghl.settlement.not_final', transaction_id: transactionId },
    'Gateway status does not settle the transaction, leaving it pending',
  )
}

/** Asks the gateway whether a reply's claim of failure holds, and records it only if it does. */
async function confirmClaim(
  deps: SettlementDeps,
  claim: Extract<GatewayReply, { kind: 'unconfirmed' }>['claim'],
  source: Exclude<Source, 'cron'>,
): Settlement {
  const { transactionId } = claim.record
  const amount = await deps.db.run(findPendingAmountInCents(transactionId))
  if (amount.isErr()) {
    return Result.err(amount.error)
  }
  if (amount.value === undefined) {
    return waiting('not_pending')
  }

  const answer = await deps.eghl.queryStatus({ amountInCents: amount.value, transactionId })
  if (answer.isErr()) {
    if (EghlGatewayBusyError.is(answer.error)) {
      logGatewayLeftPending(deps, transactionId)
    } else {
      deps.logger.warn(
        {
          'error.type': answer.error._tag,
          event: 'eghl.settlement.query_failed',
          transaction_id: transactionId,
        },
        'Could not confirm the reply with the gateway, leaving it pending',
      )
    }
    return queryFailed(answer.error)
  }

  const decision = decide(answer.value, { claim })
  if (decision.do === 'wait') {
    logGatewayLeftPending(deps, transactionId)
    return waiting(decision.why)
  }
  return recordOutcome(deps, decision.settling, source)
}

/**
 * Settles a verified callback or return reply. A signed success is recorded as it is. A claim of
 * failure is recorded only once the gateway's status query agrees. A pending reply waits.
 */
export async function settleReply(
  deps: SettlementDeps,
  reply: GatewayReply,
  source: Exclude<Source, 'cron'>,
): Settlement {
  switch (reply.kind) {
    case 'settled': {
      return recordOutcome(deps, reply.outcome, source)
    }
    case 'unconfirmed': {
      return confirmClaim(deps, reply.claim, source)
    }
    case 'pending': {
      deps.logger.info(
        { event: 'eghl.settlement.not_final', transaction_id: reply.record.transactionId },
        'Reply does not settle the transaction, leaving it pending',
      )
      return waiting('reply_pending')
    }
    default: {
      return assertExhaustive(reply)
    }
  }
}

/** A pending transaction the cron picked. */
interface PolledRow {
  readonly amountInCents: number
  readonly createdAt: Date
  readonly transactionId: string
}

function logPolledDecision(
  deps: SettlementDeps,
  { transactionId }: PolledRow,
  decision: Decision,
  ageMinutes: number,
) {
  if (decision.do === 'wait') {
    if (decision.why === 'gateway_pending') {
      deps.logger.info(
        { event: 'eghl.cron.still_pending', transaction_id: transactionId },
        'Gateway status does not settle the transaction. Skipping',
      )
    }
    return
  }
  if (decision.settling.kind === 'expired') {
    deps.logger.info(
      {
        age_minutes: Math.trunc(ageMinutes),
        event: 'eghl.cron.not_exists',
        transaction_id: transactionId,
      },
      'Transaction not found in eGHL. Marking as failed locally',
    )
    return
  }
  deps.logger.info(
    { event: 'eghl.cron.syncing_status', transaction_id: transactionId },
    'Final status found at gateway. Finalizing',
  )
}

function logPolledQueryFailure(deps: SettlementDeps, transactionId: string, error: EghlQueryError) {
  if (EghlGatewayBusyError.is(error)) {
    deps.logger.warn(
      {
        event: 'eghl.cron.query_failed',
        query_desc: error.queryDesc,
        transaction_id: transactionId,
      },
      'eGHL returned internal error. Will retry on next run',
    )
    return
  }
  deps.logger.error(
    {
      ...queryFailureFields(error),
      event: 'eghl.cron.query_failed',
      transaction_id: transactionId,
    },
    'Failed to query eGHL status',
  )
}

/** Settles one row the cron picked from the gateway's own status and the row's age. */
export async function settlePolled(deps: SettlementDeps, row: PolledRow): Settlement {
  const { amountInCents, transactionId } = row
  const answer = await deps.eghl.queryStatus({ amountInCents, transactionId })
  if (answer.isErr()) {
    logPolledQueryFailure(deps, transactionId, answer.error)
    return queryFailed(answer.error)
  }

  const ageMinutes = (now().getTime() - row.createdAt.getTime()) / 60_000
  const decision = decide(answer.value, { ageMinutes, transactionId })
  logPolledDecision(deps, row, decision, ageMinutes)
  if (decision.do === 'wait') {
    return waiting(decision.why)
  }
  return recordOutcome(deps, decision.settling, 'cron')
}
