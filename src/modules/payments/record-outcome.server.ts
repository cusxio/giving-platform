import { Result } from 'better-result'

import { now } from '#/core/date'
import type { Reachable, TransactionStatus } from '#/core/transaction-status'
import type { Deps } from '#/server/deps.server'
import type { InfraError } from '#/server/infra-error'
import { required } from '#/server/infra-error'

import type { Plan, Settling } from './payment-outcome'
import { planTransition, targetOf } from './payment-outcome'
import { touchSavedCard, upsertSavedCard } from './saved-cards.repository.server'
import { insertPayment, lockTransaction, moveTransaction } from './transactions.repository.server'

export type Recorded =
  | {
      readonly at: TransactionStatus
      readonly kind: 'absorbed'
      readonly why: 'contradiction' | 'replay'
    }
  | { readonly from: TransactionStatus; readonly kind: 'moved'; readonly to: Reachable }
  | { readonly kind: 'unknown' }

function logAbsorbed(
  logger: Deps['logger'],
  transactionId: string,
  plan: Extract<Plan, { kind: 'absorb' }>,
  to: Reachable,
) {
  if (plan.why === 'replay') {
    logger.info(
      { event: 'payment.finalize.idempotent', transaction_id: transactionId },
      'Transaction already processed or not found',
    )
    return
  }
  logger.warn(
    { event: 'payment.finalize.contradiction', status: plan.at, to, transaction_id: transactionId },
    'Final answer contradicts the stored status, leaving it as it is',
  )
}

/** The one writer of transaction status. */
export function recordOutcome(
  deps: Pick<Deps, 'db' | 'logger'>,
  outcome: Settling,
): Promise<Result<Recorded, InfraError>> {
  const { record } = outcome
  const card = outcome.kind === 'succeeded' ? outcome.card : null
  const paidAt = record.paidAt ?? now()

  return deps.db.transaction((tx) =>
    Result.gen(async function* settle() {
      const stored = yield* Result.await(tx.run(lockTransaction(record.transactionId)))

      if (stored === null) {
        deps.logger.info(
          { event: 'payment.finalize.idempotent', transaction_id: record.transactionId },
          'Transaction already processed or not found',
        )
        const unknown: Recorded = { kind: 'unknown' }
        return Result.ok(unknown)
      }

      const plan = planTransition(stored, outcome)
      if (plan.kind === 'absorb') {
        logAbsorbed(deps.logger, record.transactionId, plan, targetOf(outcome))
        const absorbed: Recorded = { at: plan.at, kind: 'absorbed', why: plan.why }
        return Result.ok(absorbed)
      }

      const moved = yield* Result.await(tx.run(moveTransaction(plan.transition)))
      yield* required(moved, moveTransaction.queryName)

      yield* Result.await(
        tx.run(
          insertPayment({
            message: record.message,
            paidAt,
            paymentMethod: record.method,
            provider: 'eghl',
            providerTransactionId: record.providerTxnId,
            transactionId: record.transactionId,
          }),
        ),
      )

      const recorded: Recorded = {
        from: plan.transition.from,
        kind: 'moved',
        to: plan.transition.to,
      }

      if (card === null || stored.createdAs !== 'user') {
        return Result.ok(recorded)
      }

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

      return Result.ok(recorded)
    }),
  )
}
