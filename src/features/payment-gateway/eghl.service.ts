import { createHash } from 'node:crypto'

import queryString from 'query-string'

import { assertExhaustive } from '#/core/assert-exhaustive'
import { createParseError } from '#/core/errors'
import { centsToRinggit } from '#/core/money'
import type { Result } from '#/core/result'
import { err, ok, tryAsync, trySync } from '#/core/result'
import { constantTimeEqual } from '#/server/crypto.server'
import { EGHL_PASSWORD, EGHL_SERVICE_ID, EGHL_URL } from '#/server/env.server'
import type { Transaction } from '#/server/schema.server'

import type { EghlFetchError, EghlQueryError } from './eghl.errors'
import type { EghlPaymentResponse, EghlQueryResponse } from './eghl.schema'
import { EghlQueryResponseSchema, EghlTxnExists } from './eghl.schema'

interface QueryTransactionStatusParams {
  amountInCents: number
  transactionId: Transaction['id']
}

// Callback and return requests wait on this query, so a slow gateway must not hold them open.
const QUERY_TIMEOUT_MS = 8000

const toFetchError = (error: unknown): EghlFetchError => ({ error, type: 'EghlFetchError' })

type SignedReply = Pick<
  EghlQueryResponse,
  | 'Amount'
  | 'AuthCode'
  | 'CurrencyCode'
  | 'HashValue'
  | 'PaymentID'
  | 'ServiceID'
  | 'TxnID'
  | 'TxnStatus'
>

type HashValue2Field = 'HashValue2' | 'OrderNumber' | 'Param6' | 'Param7'

const hashValueFields = (reply: SignedReply) => [
  EGHL_PASSWORD,
  reply.TxnID,
  reply.ServiceID,
  reply.PaymentID,
  reply.TxnStatus,
  reply.Amount,
  reply.CurrencyCode,
  reply.AuthCode,
]

export class EghlService {
  async queryTransactionStatus(
    params: QueryTransactionStatusParams,
  ): Promise<Result<EghlQueryResponse, EghlQueryError>> {
    const { transactionId, amountInCents } = params
    const amount = centsToRinggit(amountInCents)

    const requestParams = {
      Amount: amount.toFixed(2),
      CurrencyCode: 'MYR',
      PaymentID: transactionId,
      PymtMethod: 'ANY',
      ServiceID: EGHL_SERVICE_ID,
      TransactionType: 'QUERY',
    }

    const hashKeyFields = [
      EGHL_PASSWORD,
      requestParams.ServiceID,
      requestParams.PaymentID,
      requestParams.Amount,
      requestParams.CurrencyCode,
    ].join('')

    const HashValue = this.#generateHashValue(hashKeyFields)

    const queryResult = await tryAsync(
      () =>
        fetch(EGHL_URL, {
          body: new URLSearchParams({ ...requestParams, HashValue }),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          method: 'POST',
          signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
        }),
      toFetchError,
    )

    if (!queryResult.ok) {
      return queryResult
    }

    const response = queryResult.value

    const textResult = await tryAsync(() => response.text(), toFetchError)
    if (!textResult.ok) {
      return textResult
    }

    const responseText = textResult.value
    if (!response.ok) {
      return err({ message: responseText, type: 'EghlQueryResponseError' })
    }

    const qsResult = trySync(
      () => queryString.parse(responseText),
      () => ({ type: 'EghlServerError' }),
    )
    if (!qsResult.ok) {
      return qsResult
    }

    const parseResult = trySync(
      () => EghlQueryResponseSchema.Parse(qsResult.value),
      createParseError,
    )
    if (!parseResult.ok) {
      return parseResult
    }

    const eghlResponse = parseResult.value

    if (!this.#verifyQueryResponse(eghlResponse)) {
      return err({ type: 'EghlVerificationError' })
    }

    if (
      eghlResponse.PaymentID !== requestParams.PaymentID ||
      eghlResponse.Amount !== requestParams.Amount
    ) {
      return err({ type: 'EghlQueryMismatchError' })
    }

    return ok(eghlResponse)
  }

  /** Verifies a callback or return reply, which always carries HashValue2. */
  verifyPaymentResponse(response: EghlPaymentResponse) {
    return this.#matchesHashValue2(response)
  }

  #verifyQueryResponse(response: EghlQueryResponse) {
    switch (response.TxnExists) {
      case EghlTxnExists.Exists: {
        return this.#matchesHashValue2(response)
      }
      case EghlTxnExists.InternalError:
      case EghlTxnExists.NotFound: {
        return this.#matchesHashValue(response)
      }
      default: {
        return assertExhaustive(response)
      }
    }
  }

  #matchesHashValue(response: SignedReply) {
    return constantTimeEqual(
      this.#generateHashValue(hashValueFields(response).join('')),
      response.HashValue,
    )
  }

  #matchesHashValue2(response: SignedReply & Pick<EghlPaymentResponse, HashValue2Field>) {
    const { OrderNumber, Param6, Param7, HashValue2 } = response
    const hashKeyFields = [...hashValueFields(response), OrderNumber, Param6, Param7].join('')

    return constantTimeEqual(this.#generateHashValue(hashKeyFields), HashValue2)
  }

  #generateHashValue(value: string): string {
    return createHash('sha256').update(value).digest('hex')
  }
}
