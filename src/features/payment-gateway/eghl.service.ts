import { createHash } from 'node:crypto'

import queryString from 'query-string'

import { assertExhaustive } from '#/core/assert-exhaustive'
import { constantTimeEqual } from '#/core/constant-time-equal'
import { createParseError } from '#/core/errors'
import { centsToRinggit } from '#/core/money'
import type { Result } from '#/core/result'
import { err, ok, tryAsync, trySync } from '#/core/result'
import type { Transaction } from '#/db/schema'
import { BASE_URL, EGHL_PASSWORD, EGHL_SERVICE_ID, EGHL_URL } from '#/envvars'

import type { EghlQueryError } from './eghl.errors'
import type { EghlPaymentResponse, EghlQueryResponse } from './eghl.schema'
import { EghlQueryResponseSchema, EghlTxnExists } from './eghl.schema'

interface CreatePaymentRequestParams {
  amountInCents: number
  customerEmail: string
  customerName: string
  description: string
  token?: string
  transactionId: Transaction['id']
}

interface QueryTransactionStatusParams {
  amountInCents: number
  transactionId: Transaction['id']
}

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
  createPaymentRequestURL(params: CreatePaymentRequestParams) {
    const { transactionId, amountInCents, description, customerEmail, customerName, token } = params
    const amount = centsToRinggit(amountInCents)

    const requestParams = {
      Amount: amount.toFixed(2),
      CurrencyCode: 'MYR',
      CustEmail: customerEmail,
      CustName: customerName,
      MerchantCallBackURL: `${BASE_URL}/api/eghl/callback`,
      MerchantReturnURL: `${BASE_URL}/api/eghl/return`,
      OrderNumber: transactionId,
      PaymentDesc: description,
      PaymentID: transactionId,
      PymtMethod: 'ANY',
      ServiceID: EGHL_SERVICE_ID,
      TransactionType: 'SALE',
      ...(token !== undefined && { Token: token, TokenType: 'OCP' }),
    }

    const hashKeyFields = [
      EGHL_PASSWORD,
      requestParams.ServiceID,
      requestParams.PaymentID,
      requestParams.MerchantReturnURL,
      '', // MerchantApprovalURL
      '', // MerchantUnApprovalURL
      requestParams.MerchantCallBackURL,
      requestParams.Amount,
      requestParams.CurrencyCode,
      '', // CustIP
      '', // PageTimeout
      '', // CardNo
      token ?? '',
      '', // RecurringCriteria
    ].join('')

    const HashValue = this.#generateHashValue(hashKeyFields)

    return queryString.stringifyUrl({ query: { ...requestParams, HashValue }, url: EGHL_URL })
  }

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
        }),
      (error: unknown) => ({ error: error as TypeError, type: 'EghlFetchError' }),
    )

    if (!queryResult.ok) {
      return queryResult
    }

    const response = queryResult.value

    const responseText = await response.text()
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
