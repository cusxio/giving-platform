import { and, eq, sql } from 'drizzle-orm'

import { now, TZDate } from '#/core/date'
import { createTransactionError } from '#/core/errors'
import { logger } from '#/core/logger'
import { tryAsync } from '#/core/result'
import type { DB } from '#/db/client'
import {
  payments,
  savedPaymentMethods,
  Transaction,
  transactions,
} from '#/db/schema'

import type { EghlPaymentResponse } from '../payment-gateway/eghl.schema'
import { EghlTxnStatus } from '../payment-gateway/eghl.schema'

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

    return tryAsync(
      () =>
        this.#db.transaction(async (tx) => {
          const isTransactionSuccess = TxnStatus === EghlTxnStatus.Success
          const newStatus: Transaction['status'] = isTransactionSuccess
            ? 'success'
            : 'failed'

          const [transaction] = await tx
            .update(transactions)
            .set({ status: newStatus })
            .where(
              and(
                eq(transactions.id, PaymentID),
                eq(transactions.status, 'pending'),
              ),
            )
            .returning({
              userId: transactions.userId,
              createdAs: transactions.createdAs,
            })

          if (transaction === undefined) {
            logger.info(
              {
                event: 'payment.finalize.idempotent',
                transaction_id: PaymentID,
              },
              'Transaction already processed or not found',
            )
            return
          }

          let paidAt = now()
          const rawTime = RespTime ?? RespTime2
          if (rawTime !== undefined) {
            const isoTime = rawTime.replace(' ', 'T')
            const parsedDate = new TZDate(isoTime)
            if (!Number.isNaN(parsedDate.getTime())) {
              paidAt = parsedDate
            }
          }

          await tx
            .insert(payments)
            .values({
              transactionId: PaymentID,
              providerTransactionId: TxnID,
              provider: 'eghl',
              paymentMethod: PymtMethod,
              paidAt,
              message: TxnMessage,
            })

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
        }),
      createTransactionError,
    )
  }
}
