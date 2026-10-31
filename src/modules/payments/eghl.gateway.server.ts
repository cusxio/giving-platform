import { createHash } from 'node:crypto'

import queryString from 'query-string'

import { assertExhaustive } from '#/core/assert-exhaustive'
import { createParseError } from '#/core/errors'
import { centsToRinggit } from '#/core/money'
import type { Result } from '#/core/result'
import { err, ok, tryAsync, trySync } from '#/core/result'
import { constantTimeEqual } from '#/server/crypto.server'

import type { EghlCallbackError, EghlFetchError, EghlQueryError } from './eghl.errors'
import type { EghlPaymentResponse, EghlQueryResponse } from './eghl.wire'
import { EghlPaymentResponseSchema, EghlQueryResponseSchema, EghlTxnExists } from './eghl.wire'
import type { PaymentGateway, PaymentRequest, StatusQuery } from './gateway'

export interface EghlConfig {
  /** Origin the gateway calls back and returns the donor to. */
  readonly baseUrl: string
  readonly password: string
  readonly serviceId: string
  readonly url: string
}

// Callback and return requests wait on this query, so a slow gateway must not hold them open.
const QUERY_TIMEOUT_MS = 8000

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

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

export function createEghlClient(config: EghlConfig): PaymentGateway {
  const hashValueFields = (reply: SignedReply) => [
    config.password,
    reply.TxnID,
    reply.ServiceID,
    reply.PaymentID,
    reply.TxnStatus,
    reply.Amount,
    reply.CurrencyCode,
    reply.AuthCode,
  ]

  const matchesHashValue = (response: SignedReply) =>
    constantTimeEqual(sha256(hashValueFields(response).join('')), response.HashValue)

  const matchesHashValue2 = (
    response: SignedReply & Pick<EghlPaymentResponse, HashValue2Field>,
  ) => {
    const { OrderNumber, Param6, Param7, HashValue2 } = response
    const hashKeyFields = [...hashValueFields(response), OrderNumber, Param6, Param7].join('')

    return constantTimeEqual(sha256(hashKeyFields), HashValue2)
  }

  const verifyQueryResponse = (response: EghlQueryResponse) => {
    switch (response.TxnExists) {
      case EghlTxnExists.Exists: {
        return matchesHashValue2(response)
      }
      case EghlTxnExists.InternalError:
      case EghlTxnExists.NotFound: {
        return matchesHashValue(response)
      }
      default: {
        return assertExhaustive(response)
      }
    }
  }

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

    // A callback or return reply always carries HashValue2.
    async readReply(request: Request): Promise<Result<EghlPaymentResponse, EghlCallbackError>> {
      let raw: string

      if (request.method === 'GET') {
        raw = new URL(request.url).search
      } else if (request.method === 'POST') {
        const bodyResult = await tryAsync(
          () => request.text(),
          () => ({ type: 'EghlServerError' }),
        )

        if (!bodyResult.ok) {
          return bodyResult
        }
        raw = bodyResult.value
      } else {
        return err({ type: 'EghlInvalidMethodError' })
      }

      const qsResult = trySync(
        () => queryString.parse(raw),
        () => ({ type: 'EghlServerError' }),
      )
      if (!qsResult.ok) {
        return qsResult
      }

      const parseResult = trySync(
        () => EghlPaymentResponseSchema.Parse(qsResult.value),
        createParseError,
      )
      if (!parseResult.ok) {
        return parseResult
      }

      const eghlResponse = parseResult.value

      if (!matchesHashValue2(eghlResponse)) {
        return err({ type: 'EghlVerificationError' })
      }

      return ok(eghlResponse)
    },

    async queryStatus(query: StatusQuery): Promise<Result<EghlQueryResponse, EghlQueryError>> {
      const { transactionId, amountInCents } = query
      const amount = centsToRinggit(amountInCents)

      const requestParams = {
        Amount: amount.toFixed(2),
        CurrencyCode: 'MYR',
        PaymentID: transactionId,
        PymtMethod: 'ANY',
        ServiceID: config.serviceId,
        TransactionType: 'QUERY',
      }

      const hashKeyFields = [
        config.password,
        requestParams.ServiceID,
        requestParams.PaymentID,
        requestParams.Amount,
        requestParams.CurrencyCode,
      ].join('')

      const HashValue = sha256(hashKeyFields)

      const queryResult = await tryAsync(
        () =>
          fetch(config.url, {
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

      if (!verifyQueryResponse(eghlResponse)) {
        return err({ type: 'EghlVerificationError' })
      }

      if (
        eghlResponse.PaymentID !== requestParams.PaymentID ||
        eghlResponse.Amount !== requestParams.Amount
      ) {
        return err({ type: 'EghlQueryMismatchError' })
      }

      return ok(eghlResponse)
    },
  }
}
