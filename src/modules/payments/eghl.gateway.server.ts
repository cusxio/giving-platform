import { createHash } from 'node:crypto'

import queryString from 'query-string'

import { centsToRinggit } from '#/core/money'

import type { PaymentGateway, PaymentRequest } from './gateway'

export interface EghlConfig {
  /** Origin the gateway calls back and returns the donor to. */
  readonly baseUrl: string
  readonly password: string
  readonly serviceId: string
  readonly url: string
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

export function createEghlClient(config: EghlConfig): PaymentGateway {
  return {
    paymentRequestUrl(request: PaymentRequest) {
      const { transactionId, amountInCents, description, customerEmail, customerName, token } =
        request
      const amount = centsToRinggit(amountInCents)

      const requestParams = {
        Amount: amount.toFixed(2),
        CurrencyCode: 'MYR',
        CustEmail: customerEmail,
        CustName: customerName,
        MerchantCallBackURL: `${config.baseUrl}/api/eghl/callback`,
        MerchantReturnURL: `${config.baseUrl}/api/eghl/return`,
        OrderNumber: transactionId,
        PaymentDesc: description,
        PaymentID: transactionId,
        PymtMethod: 'ANY',
        ServiceID: config.serviceId,
        TransactionType: 'SALE',
        ...(token !== undefined && { Token: token, TokenType: 'OCP' }),
      }

      const hashKeyFields = [
        config.password,
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

      return queryString.stringifyUrl({
        query: { ...requestParams, HashValue: sha256(hashKeyFields) },
        url: config.url,
      })
    },
  }
}
