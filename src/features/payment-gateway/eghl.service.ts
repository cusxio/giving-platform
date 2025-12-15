import { sha256 } from '@oslojs/crypto/sha2'
import { encodeHexLowerCase } from '@oslojs/encoding'
import queryString from 'query-string'

import { centsToRinggit } from '#/core/money'
import { BASE_URL, EGHL_PASSWORD, EGHL_SERVICE_ID, EGHL_URL } from '#/envvars'

import type { EghlPaymentResponse } from './eghl.schema'

interface CreatePaymentRequestParams {
  amountInCents: number
  customerEmail: string
  customerName: string
  description: string
  token?: string
  transactionId: string
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

    return calculatedHash === HashValue2
  }

  #generateHashValue(value: string): string {
    const data = new TextEncoder().encode(value)
    const hash = sha256(data)
    return encodeHexLowerCase(hash)
  }
}
