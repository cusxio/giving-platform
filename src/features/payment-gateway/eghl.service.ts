import { sha256 } from '@oslojs/crypto/sha2'
import { constantTimeEqual } from '@oslojs/crypto/subtle'
import { encodeHexLowerCase } from '@oslojs/encoding'
import queryString from 'query-string'

import { createParseError } from '#/core/errors'
import { centsToRinggit } from '#/core/money'
import { err, ok, tryAsync, trySync } from '#/core/result'
import { Transaction } from '#/db/schema'
import { BASE_URL, EGHL_PASSWORD, EGHL_SERVICE_ID, EGHL_URL } from '#/envvars'

import type { EghlPaymentResponse } from './eghl.schema'
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
    const {
      transactionId,
      amountInCents,
      description,
      customerEmail,
      customerName,
      token,
    } = params
    const amount = centsToRinggit(amountInCents)

    const requestParams = {
      TransactionType: 'SALE',
      PymtMethod: 'ANY',
      ServiceID: EGHL_SERVICE_ID,
      PaymentID: transactionId,
      OrderNumber: transactionId,
      PaymentDesc: description,
      MerchantReturnURL: `${BASE_URL}/api/eghl/return`,
      MerchantCallBackURL: `${BASE_URL}/api/eghl/callback`,
      Amount: amount.toFixed(2),
      CurrencyCode: 'MYR',
      CustName: customerName,
      CustEmail: customerEmail,
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

    return queryString.stringifyUrl({
      url: EGHL_URL,
      query: { ...requestParams, HashValue },
    })
  }

  async queryTransactionStatus(params: QueryTransactionStatusParams) {
    const { transactionId, amountInCents } = params
    const amount = centsToRinggit(amountInCents)

    const requestParams = {
      TransactionType: 'QUERY',
      PymtMethod: 'ANY',
      ServiceID: EGHL_SERVICE_ID,
      PaymentID: transactionId,
      Amount: amount.toFixed(2),
      CurrencyCode: 'MYR',
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
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ ...requestParams, HashValue }),
        }),
      (error: unknown) => ({
        type: 'FETCH_ERROR' as const,
        error: error as TypeError,
      }),
    )

    if (!queryResult.ok) return queryResult

    const response = queryResult.value

    const responseText = await response.text()
    if (!response.ok) {
      return err({ type: 'QUERY_ERROR' as const, message: responseText })
    }

    const qsResult = trySync(
      () => queryString.parse(responseText),
      () => ({ type: 'SERVER_ERROR' as const }),
    )
    if (!qsResult.ok) return qsResult

    const parseResult = trySync(
      () => EghlQueryResponseSchema.Parse(qsResult.value),
      createParseError,
    )
    if (!parseResult.ok) return parseResult

    const eghlResponse = parseResult.value

    if (!this.verifyPaymentResponse(eghlResponse)) {
      return err({ type: 'EGHL_VERIFICATION_ERROR' as const })
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

    if (!HashValue2) return false

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

    return constantTimeEqual(
      encoder.encode(calculatedHash),
      encoder.encode(HashValue2),
    )
  }

  #generateHashValue(value: string): string {
    const data = new TextEncoder().encode(value)
    const hash = sha256(data)
    return encodeHexLowerCase(hash)
  }
}
