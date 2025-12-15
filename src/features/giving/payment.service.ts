import { and, eq, sql } from 'drizzle-orm'

import { now } from '#/core/date'
import { createTransactionError } from '#/core/errors'
import { logger } from '#/core/logger'
import { tryAsync } from '#/core/result'
import type { DB } from '#/db/client'
import { TransactionRollbackError } from '#/db/errors'
import { payments, savedPaymentMethods, transactions } from '#/db/schema'

import { EghlTxnStatus } from '../payment-gateway/eghl.schema'
import type { EghlPaymentResponse } from '../payment-gateway/eghl.schema'

export class PaymentService {
  #db: DB

  constructor(db: DB) {
    this.#db = db
  }

  async finalizePaymentFromCallback(response: EghlPaymentResponse) {
    const {
      PaymentID,
      TxnStatus,
      PymtMethod,
      RespTime,
      TxnMessage,
      TxnID,
      TokenType,
      Token,
      CardNoMask,
      CardExp,
      CardType,
      CardHolder,
    } = response

    return tryAsync(
      () =>
        this.#db.transaction(async (tx) => {
          const foundTransactions = await tx
            .select()
            .from(transactions)
            .where(and(eq(transactions.id, PaymentID)))

          const transaction = foundTransactions[0]
          if (!transaction) {
            throw new TransactionRollbackError(
              `Transaction with ID ${PaymentID} not found.`,
            )
          }

          if (transaction.status !== 'pending') {
            logger.info(
              {
                event: 'payment.finalize.idempotent',
                transactionId: PaymentID,
                currentStatus: transaction.status,
              },
              'Transaction already processed, skipping update',
            )
            return
          }

          const isTransactionSuccess = TxnStatus === EghlTxnStatus.Success

          await tx
            .update(transactions)
            .set({ status: isTransactionSuccess ? 'success' : 'failed' })
            .where(eq(transactions.id, PaymentID))

          const shouldSaveCard =
            isTransactionSuccess && transaction.createdAs === 'user'

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
                userId: transaction.userId,
                token: Token,
                tokenType: 'OCP',
                cardNoMask: CardNoMask,
                cardExp: CardExp,
                cardType: CardType,
                cardHolder: CardHolder,
                lastUsedAt: now(),
              })
              .onConflictDoUpdate({
                target: [
                  savedPaymentMethods.userId,
                  savedPaymentMethods.cardNoMask,
                  savedPaymentMethods.cardExp,
                ],
                set: {
                  token: sql`excluded.token`, // Token might rotate
                  lastUsedAt: now(),
                },
              })
          } else if (
            shouldSaveCard &&
            TokenType === 'OCP' &&
            Token !== undefined
          ) {
            // Update last used time if existing token was used
            await tx
              .update(savedPaymentMethods)
              .set({ lastUsedAt: now() })
              .where(eq(savedPaymentMethods.token, Token))
          }

          await tx
            .insert(payments)
            .values({
              transactionId: PaymentID,
              providerTransactionId: TxnID,
              provider: 'eghl',
              paymentMethod: PymtMethod,
              paidAt: RespTime === undefined ? now() : new Date(RespTime),
              message: TxnMessage,
            })
        }),
      createTransactionError,
    )
  }
}
