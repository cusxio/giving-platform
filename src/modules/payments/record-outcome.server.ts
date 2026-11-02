import { Result } from 'better-result'

import { now } from '#/core/date'
import type { Reachable, TransactionStatus } from '#/core/transaction-status'
import type { Deps } from '#/server/deps.server'
import type { InfraError } from '#/server/infra-error'
import { required } from '#/server/infra-error'
import { logAlert } from '#/server/procedure.server'

import type { HoldReason, Plan, Settling } from './payment-outcome'
import { planTransition, targetOf, transactionIdOf } from './payment-outcome'
import { touchSavedCard, upsertSavedCard } from './saved-cards.repository.server'
import { insertPayment, lockTransaction, moveTransaction } from './transactions.repository.server'

export type Source = 'callback' | 'cron' | 'return'

export type Recorded =
  | {
      readonly at: TransactionStatus
      readonly kind: 'absorbed'
      readonly why: 'contradiction' | 'replay'
    }
  | { readonly kind: 'held'; readonly why: HoldReason }
  | {
      readonly from: TransactionStatus
      readonly kind: 'moved'
      readonly to: Reachable
      readonly via: Settling['kind']
    }
  | { readonly kind: 'unknown' }

function logAbsorbed(
  logger: Deps['logger'],
  fields: { readonly source: Source; readonly transaction_id: string },
  plan: Extract<Plan, { kind: 'absorb' }>,
  to: Reachable,
) {
  if (plan.why === 'replay') {
    logger.info(
      { event: 'payment.finalize.idempotent', ...fields },
      'Transaction already processed or not found',
    )
    return
  }
  logger.warn(
    { event: 'payment.finalize.contradiction', status: plan.at, to, ...fields },
    'Final answer contradicts the stored status, leaving it as it is',
  )
}

/** The one writer of transaction status. */
export function recordOutcome(
  deps: Pick<Deps, 'db' | 'logger'>,
  outcome: Settling,
  source: Source,
): Promise<Result<Recorded, InfraError>> {
  const transactionId = transactionIdOf(outcome)
  const recordedAt = now()
  const logFields = { source, transaction_id: transactionId }

  return deps.db.transaction((tx) =>
    Result.gen(async function* settle() {
      const stored = yield* Result.await(tx.run(lockTransaction(transactionId)))

      if (stored === null) {
        deps.logger.info(
          { event: 'payment.finalize.idempotent', ...logFields },
          'Transaction already processed or not found',
        )
        const unknown: Recorded = { kind: 'unknown' }
        return Result.ok(unknown)
      }

      const plan = planTransition(stored, outcome)
      if (plan.kind === 'absorb') {
        logAbsorbed(deps.logger, logFields, plan, targetOf(outcome))
        const absorbed: Recorded = { at: plan.at, kind: 'absorbed', why: plan.why }
        return Result.ok(absorbed)
      }

      const moved = yield* Result.await(tx.run(moveTransaction(plan.transition)))
      yield* required(moved, moveTransaction.queryName)

      if (plan.kind === 'hold') {
        logAlert(
          deps.logger,
          {
            amount_in_cents: plan.received.amountInCents,
            currency: plan.received.currency,
            event: `payment.finalize.${plan.why}`,
            from: plan.transition.from,
            method: plan.received.method,
            provider_txn_id: plan.received.providerTxnId,
            stored_amount_in_cents: stored.amountInCents,
            ...logFields,
          },
          'Gateway reports a success for other money than the transaction, holding it',
        )
        const held: Recorded = { kind: 'held', why: plan.why }
        return Result.ok(held)
      }

      const recorded: Recorded = {
        from: plan.transition.from,
        kind: 'moved',
        to: plan.transition.to,
        via: outcome.kind,
      }

      if (outcome.kind === 'expired') {
        return Result.ok(recorded)
      }

      const { record } = outcome
      yield* Result.await(
        tx.run(
          insertPayment({
            message: record.message,
            paidAt: record.paidAt ?? recordedAt,
            paymentMethod: record.method,
            provider: 'eghl',
            providerTransactionId: record.providerTxnId,
            transactionId,
          }),
        ),
      )

      const card = outcome.kind === 'succeeded' ? outcome.card : null
      if (card !== null && stored.createdAs === 'user') {
        yield* Result.await(
          tx.run(
            card.kind === 'saved'
              ? upsertSavedCard({
                  cardExp: card.card.exp,
                  cardHolder: card.card.holder,
                  cardNoMask: card.card.mask,
                  cardType: card.card.type,
                  token: card.card.token,
                  userId: stored.userId,
                })
              : touchSavedCard(stored.userId, card.token),
          ),
        )
      }

      if (plan.transition.from !== 'pending') {
        logAlert(
          deps.logger,
          {
            event: 'payment.finalize.late_success',
            from: plan.transition.from,
            provider_txn_id: record.providerTxnId,
            ...logFields,
          },
          'Gateway reports a success for a transaction recorded as failed, recording the success',
        )
      }

      return Result.ok(recorded)
    }),
  )
}
