import { createHash } from 'node:crypto'

import { Result } from 'better-result'
import type { Logger } from 'pino'
import queryString from 'query-string'

import { assertExhaustive } from '#/core/assert-exhaustive'
import { centsToRinggit } from '#/core/money'
import { constantTimeEqual } from '#/server/crypto.server'

import type { EghlReplyError } from './eghl.errors'
import {
  EghlFetchError,
  EghlInvalidMethodError,
  EghlQueryMismatchError,
  EghlQueryResponseError,
  EghlServerError,
  EghlVerificationError,
  ParseError,
} from './eghl.errors'
import { isUnexpectedForSale, outcomeOf, replyOf } from './eghl.outcome'
import type { EghlPaymentResponse, EghlQueryResponse, Verified } from './eghl.wire'
import { EghlPaymentResponseSchema, EghlQueryResponseSchema, EghlTxnExists } from './eghl.wire'
import type { PaymentGateway, PaymentRequest } from './gateway'
import { PAYMENT_CURRENCY } from './payment-outcome'

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

async function readBody(request: Request): Promise<Result<string, EghlReplyError>> {
  if (request.method === 'GET') {
    return Result.ok(new URL(request.url).search)
  }
  if (request.method === 'POST') {
    return Result.tryPromise({ catch: () => new EghlServerError(), try: () => request.text() })
  }
  return Result.err(new EghlInvalidMethodError())
}

const fieldsOf = (raw: string) =>
  Result.try({ catch: () => new EghlServerError(), try: () => queryString.parse(raw) })

const parseFailed = (cause: unknown) => new ParseError({ cause })

const fetchFailed = (cause: unknown) => new EghlFetchError({ cause })

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

function logAnswer(logger: Logger, answer: EghlQueryResponse) {
  const fields = {
    event: 'eghl.query.answered',
    status: answer.TxnStatus,
    transaction_id: answer.PaymentID,
    txn_exists: answer.TxnExists,
  }
  if (isUnexpectedForSale(answer)) {
    logger.error(fields, 'Gateway reports a status a sale cannot reach, leaving it pending')
  } else {
    logger.info(fields, 'Gateway answered the status query')
  }
}

export function createEghlClient(config: EghlConfig, logger: Logger): PaymentGateway {
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
        CurrencyCode: PAYMENT_CURRENCY,
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
    readReply: (request) =>
      Result.gen(async function* readReply() {
        const raw = yield* Result.await(readBody(request))
        const fields = yield* fieldsOf(raw)
        const reply = yield* Result.try({
          catch: parseFailed,
          try: () => EghlPaymentResponseSchema.Parse(fields),
        })
        if (!matchesHashValue2(reply)) {
          return Result.err(new EghlVerificationError())
        }
        logger.info(
          {
            event: 'eghl.reply.verified',
            status: reply.TxnStatus,
            transaction_id: reply.PaymentID,
          },
          'Gateway reply signature verified',
        )
        return Result.ok(replyOf(reply as Verified<EghlPaymentResponse>))
      }),

    queryStatus: ({ transactionId, amountInCents }) =>
      Result.gen(async function* queryStatus() {
        const amount = centsToRinggit(amountInCents)

        const requestParams = {
          Amount: amount.toFixed(2),
          CurrencyCode: PAYMENT_CURRENCY,
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

        const response = yield* Result.await(
          Result.tryPromise({
            catch: fetchFailed,
            try: () =>
              fetch(config.url, {
                body: new URLSearchParams({ ...requestParams, HashValue }),
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                method: 'POST',
                signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
              }),
          }),
        )
        const responseText = yield* Result.await(
          Result.tryPromise({ catch: fetchFailed, try: () => response.text() }),
        )
        if (!response.ok) {
          return Result.err(new EghlQueryResponseError())
        }

        const fields = yield* fieldsOf(responseText)
        const reply = yield* Result.try({
          catch: parseFailed,
          try: () => EghlQueryResponseSchema.Parse(fields),
        })

        if (!verifyQueryResponse(reply)) {
          return Result.err(new EghlVerificationError())
        }

        if (reply.PaymentID !== requestParams.PaymentID || reply.Amount !== requestParams.Amount) {
          return Result.err(new EghlQueryMismatchError())
        }

        logAnswer(logger, reply)
        return outcomeOf(reply as Verified<EghlQueryResponse>)
      }),
  }
}
