import { and, eq, sql } from 'drizzle-orm'

import { TZDate, now } from '#/core/date'
import { createDBError, createTransactionError } from '#/core/errors'
import { logger } from '#/core/logger'
import { ok, tryAsync } from '#/core/result'
import type { DBPool } from '#/server/neon.server'
import type { PaymentInsert, Transaction } from '#/server/schema.server'
import { payments, savedPaymentMethods, transactions } from '#/server/schema.server'

import type { EghlFinalStatus } from '../payment-gateway/eghl.finality'
import type { EghlPaymentResponse, EghlQueryResponse } from '../payment-gateway/eghl.schema'

export class PaymentService {
  readonly #dbPool: DBPool

  constructor(db: DBPool) {
    this.#dbPool = db
  }

  /** The amount of a transaction still awaiting a final status, or undefined once settled. */
  async findPendingAmountInCents(transactionId: Transaction['id']) {
    const result = await tryAsync(
      () =>
        this.#dbPool
          .select({ amount: transactions.amount })
          .from(transactions)
          .where(and(eq(transactions.id, transactionId), eq(transactions.status, 'pending'))),
      createDBError,
    )

    if (!result.ok) {
      return result
    }

    return ok(result.value[0]?.amount)
  }

  async finalizePaymentFromCallback(
    response: EghlPaymentResponse | EghlQueryResponse,
    status: EghlFinalStatus,
  ) {
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
            .set({ status })
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
              .where(
                and(
                  eq(savedPaymentMethods.userId, transaction.userId),
                  eq(savedPaymentMethods.token, Token),
                ),
              )
          }

          return { finalized: true }
        }),
      createTransactionError,
    )
  }
}
