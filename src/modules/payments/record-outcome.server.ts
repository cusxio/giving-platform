import { Result } from 'better-result'

import { TZDate, now } from '#/core/date'
import type { Deps } from '#/server/deps.server'
import type { InfraError } from '#/server/infra-error'

import type { EghlFinalStatus } from './eghl.outcome'
import type { EghlPaymentResponse, EghlQueryResponse } from './eghl.wire'
import { touchSavedCard, upsertSavedCard } from './saved-cards.repository.server'
import { insertPayment, settleTransaction } from './transactions.repository.server'

/**
 * The one writer of a settled status. Moves a pending transaction to `status` and records the
 * payment, and for a user's successful card payment saves or touches the card, all in one
 * transaction that any failed statement rolls back. A transaction that is no longer pending is
 * left alone.
 */
export function recordOutcome(
  deps: Pick<Deps, 'db' | 'logger'>,
  response: EghlPaymentResponse | EghlQueryResponse,
  status: EghlFinalStatus,
): Promise<Result<{ finalized: boolean }, InfraError>> {
  const {
    PaymentID,
    PymtMethod,
    RespTime,
    RespTime2,
    TxnMessage,
    TxnID,
    TokenType,
    Token,
    CardNoMask,
    CardExp,
    CardType,
    CardHolder,
  } = response
  const isTransactionSuccess = status === 'success'

  let paidAt = now()
  const rawTime = RespTime ?? RespTime2
  if (rawTime !== undefined) {
    const isoTime = `${rawTime.replace(' ', 'T')}+08:00`
    const parsedDate = new TZDate(isoTime)
    if (!Number.isNaN(parsedDate.getTime())) {
      paidAt = parsedDate
    }
  }

  return deps.db.transaction((tx) =>
    Result.gen(async function* settle() {
      const transaction = yield* Result.await(tx.run(settleTransaction(PaymentID, status)))

      if (transaction === null) {
        deps.logger.info(
          { event: 'payment.finalize.idempotent', transaction_id: PaymentID },
          'Transaction already processed or not found',
        )
        return Result.ok({ finalized: false })
      }

      yield* Result.await(
        tx.run(
          insertPayment({
            message: TxnMessage,
            paidAt,
            paymentMethod: PymtMethod,
            provider: 'eghl',
            providerTransactionId: TxnID,
            transactionId: PaymentID,
          }),
        ),
      )

      const shouldSaveCard = isTransactionSuccess && transaction.createdAs === 'user'

      if (
        shouldSaveCard &&
        TokenType === 'OCP' &&
        Token !== undefined &&
        CardNoMask !== undefined &&
        CardExp !== undefined &&
        CardType !== undefined
      ) {
        yield* Result.await(
          tx.run(
            upsertSavedCard({
              cardExp: CardExp,
              cardHolder: CardHolder,
              cardNoMask: CardNoMask,
              cardType: CardType,
              token: Token,
              userId: transaction.userId,
            }),
          ),
        )
      } else if (shouldSaveCard && TokenType === 'OCP' && Token !== undefined) {
        // Update last used time if existing token was used
        yield* Result.await(tx.run(touchSavedCard(transaction.userId, Token)))
      }

      return Result.ok({ finalized: true })
    }),
  )
}
