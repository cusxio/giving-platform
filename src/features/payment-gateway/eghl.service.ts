import { sha256 } from '@oslojs/crypto/sha2'
import { constantTimeEqual } from '@oslojs/crypto/subtle'
import { encodeHexLowerCase } from '@oslojs/encoding'
import queryString from 'query-string'

import { createParseError } from '#/core/errors'
import { centsToRinggit } from '#/core/money'
import type { Result } from '#/core/result'
import { err, ok, tryAsync, trySync } from '#/core/result'
import type { Transaction } from '#/db/schema'
import { BASE_URL, EGHL_PASSWORD, EGHL_SERVICE_ID, EGHL_URL } from '#/envvars'

import type { EghlQueryError } from './eghl.errors'
import type { EghlPaymentResponse, EghlQueryResponse } from './eghl.schema'
import { EghlQueryResponseSchema } from './eghl.schema'

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

    if (!this.verifyPaymentResponse(eghlResponse)) {
      return err({ type: 'EghlVerificationError' })
    }

    return ok(eghlResponse)
  }

  verifyPaymentResponse(response: EghlPaymentResponse) {
    const {
      TxnID,
      ServiceID,
      PaymentID,
      TxnStatus,
      Amount,
      CurrencyCode,
      AuthCode,
      OrderNumber,
      Param6,
      Param7,
      HashValue2,
    } = response

    if (!HashValue2) {
      return false
    }

    const hashKeyFields = [
      EGHL_PASSWORD,
      TxnID,
      ServiceID,
      PaymentID,
      TxnStatus,
      Amount,
      CurrencyCode,
      AuthCode,
      OrderNumber,
      Param6,
      Param7,
    ].join('')

    const calculatedHash = this.#generateHashValue(hashKeyFields)

    const encoder = new TextEncoder()

    return constantTimeEqual(encoder.encode(calculatedHash), encoder.encode(HashValue2))
  }

  #generateHashValue(value: string): string {
    const data = new TextEncoder().encode(value)
    const hash = sha256(data)
    return encodeHexLowerCase(hash)
  }
}
