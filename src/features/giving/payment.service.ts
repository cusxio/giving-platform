import { and, eq, sql } from 'drizzle-orm'

import { TZDate, now } from '#/core/date'
import { createTransactionError } from '#/core/errors'
import { logger } from '#/core/logger'
import { tryAsync } from '#/core/result'
import type { DBPool } from '#/db/client'
import type { PaymentInsert, Transaction } from '#/db/schema'
import { payments, savedPaymentMethods, transactions } from '#/db/schema'

import type { EghlPaymentResponse } from '../payment-gateway/eghl.schema'
import { EghlTxnStatus } from '../payment-gateway/eghl.schema'

export class PaymentService {
  readonly #dbPool: DBPool

  constructor(db: DBPool) {
    this.#dbPool = db
  }

  async finalizePaymentFromCallback(response: EghlPaymentResponse) {
    const {
      PaymentID,
      TxnStatus,
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
    const isTransactionSuccess = TxnStatus === EghlTxnStatus.Success
    const newStatus: Transaction['status'] = isTransactionSuccess ? 'success' : 'failed'

    let paidAt = now()
    const rawTime = RespTime ?? RespTime2
    if (rawTime !== undefined) {
      const isoTime = `${rawTime.replace(' ', 'T')}+08:00`
      const parsedDate = new TZDate(isoTime)
      if (!Number.isNaN(parsedDate.getTime())) {
        paidAt = parsedDate
      }
    }
    const paymentData: PaymentInsert = {
      message: TxnMessage,
      paidAt,
      paymentMethod: PymtMethod,
      provider: 'eghl',
      providerTransactionId: TxnID,
      transactionId: PaymentID,
    }

    return tryAsync(
      () =>
        this.#dbPool.transaction(async (tx) => {
          const [transaction] = await tx
            .update(transactions)
            .set({ status: newStatus })
            .where(and(eq(transactions.id, PaymentID), eq(transactions.status, 'pending')))
            .returning({ createdAs: transactions.createdAs, userId: transactions.userId })

          if (transaction === undefined) {
            logger.info(
              { event: 'payment.finalize.idempotent', transaction_id: PaymentID },
              'Transaction already processed or not found',
            )
            return { finalized: false }
          }

          await tx.insert(payments).values(paymentData)

          const shouldSaveCard = isTransactionSuccess && transaction.createdAs === 'user'

          if (
            shouldSaveCard &&
            TokenType === 'OCP' &&
            Token !== undefined &&
            CardNoMask !== undefined &&
            CardExp !== undefined &&
            CardType !== undefined
          ) {
            await tx
              .insert(savedPaymentMethods)
              .values({
                cardExp: CardExp,
                cardHolder: CardHolder,
                cardNoMask: CardNoMask,
                cardType: CardType,
                lastUsedAt: now(),
                token: Token,
                tokenType: 'OCP',
                userId: transaction.userId,
              })
              .onConflictDoUpdate({
                set: {
                  token: sql`excluded.token`, // Token might rotate
                  lastUsedAt: now(),
                },
                target: [
                  savedPaymentMethods.userId,
                  savedPaymentMethods.cardNoMask,
                  savedPaymentMethods.cardExp,
                ],
              })
          } else if (shouldSaveCard && TokenType === 'OCP' && Token !== undefined) {
            // Update last used time if existing token was used
            await tx
              .update(savedPaymentMethods)
              .set({ lastUsedAt: now() })
              .where(eq(savedPaymentMethods.token, Token))
          }

          return { finalized: true }
        }),
      createTransactionError,
    )
  }
}
