import { Result } from 'better-result'

import { now } from '#/core/date'
import type { Deps } from '#/server/deps.server'
import type { InfraError } from '#/server/infra-error'

import type { Settling } from './payment-outcome'
import { touchSavedCard, upsertSavedCard } from './saved-cards.repository.server'
import { insertPayment, settleTransaction } from './transactions.repository.server'

/**
 * The one writer of a settled status. Moves a pending transaction to the outcome's status and
 * records the payment, and for a user's successful card payment saves or touches the card, all
 * in one transaction that any failed statement rolls back. A transaction that is no longer
 * pending is left alone.
 */
export function recordOutcome(
  deps: Pick<Deps, 'db' | 'logger'>,
  outcome: Settling,
): Promise<Result<{ finalized: boolean }, InfraError>> {
  const { record } = outcome
  const status = outcome.kind === 'succeeded' ? 'success' : 'failed'
  const card = outcome.kind === 'succeeded' ? outcome.card : null
  const paidAt = record.paidAt ?? now()

  return deps.db.transaction((tx) =>
    Result.gen(async function* settle() {
      const transaction = yield* Result.await(
        tx.run(settleTransaction(record.transactionId, status)),
      )

      if (transaction === null) {
        deps.logger.info(
          { event: 'payment.finalize.idempotent', transaction_id: record.transactionId },
          'Transaction already processed or not found',
        )
        return Result.ok({ finalized: false })
      }

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

      if (card === null || transaction.createdAs !== 'user') {
        return Result.ok({ finalized: true })
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
                userId: transaction.userId,
              })
            : touchSavedCard(transaction.userId, card.token),
        ),
      )

      return Result.ok({ finalized: true })
    }),
  )
}
