import { createHash } from 'node:crypto'

import { pino } from 'pino'
import { describe, expect, it, vi } from 'vitest'

import { recordingLogger } from '#/server/testing/recording-logger'
import { errValue, okValue } from '#/server/testing/result'

import { createEghlClient } from './eghl.gateway.server'
import type { EghlPaymentResponse } from './eghl.wire'
import { EghlQueryTxnStatus, EghlTxnExists, EghlTxnStatus } from './eghl.wire'

const config = {
  baseUrl: 'https://app.give.test',
  password: 'secret-password',
  serviceId: 'service-123',
  url: 'https://eghl.test/pay',
}

const silent = pino({ level: 'silent' })

const hashValue = (value: string) => createHash('sha256').update(value).digest('hex')

const expectedReturnURL = `${config.baseUrl}/api/eghl/return`
const expectedCallbackURL = `${config.baseUrl}/api/eghl/callback`

/** The payment request's hash key, in the documented order. */
const signedFields = (token: string) =>
  Object.values({
    Password: config.password,
    ServiceID: config.serviceId,
    PaymentID: 'txn_001',
    MerchantReturnURL: expectedReturnURL,
    MerchantApprovalURL: '',
    MerchantUnApprovalURL: '',
    MerchantCallBackURL: expectedCallbackURL,
    Amount: '99.50',
    CurrencyCode: 'MYR',
    CustIP: '',
    PageTimeout: '600',
    CardNo: '',
    Token: token,
    RecurringCriteria: '',
  }).join('')

const request = {
  amountInCents: 9950,
  customerEmail: 'jane@example.com',
  customerName: 'Jane Doe',
  description: 'Giving',
  transactionId: 'txn_001',
}

describe('the eGHL client', () => {
  it('builds a signed payment request that eGHL accepts', () => {
    expect.hasAssertions()

    const url = createEghlClient(config, silent).paymentRequestUrl(request)

    const parsed = new URL(url)
    expect(`${parsed.origin}${parsed.pathname}`).toBe(config.url)

    const params = parsed.searchParams
    expect(Object.fromEntries(params)).toMatchObject({
      Amount: '99.50',
      CurrencyCode: 'MYR',
      CustEmail: 'jane@example.com',
      CustName: 'Jane Doe',
      MerchantCallBackURL: expectedCallbackURL,
      MerchantReturnURL: expectedReturnURL,
      OrderNumber: 'txn_001',
      PageTimeout: '600',
      PaymentID: 'txn_001',
      ServiceID: config.serviceId,
    })
    expect(params.has('Token')).toBe(false)
    expect(params.get('HashValue')).toBe(hashValue(signedFields('')))
  })

  it('charges a saved card by its token, signing the token too', () => {
    expect.hasAssertions()

    const url = createEghlClient(config, silent).paymentRequestUrl({
      ...request,
      token: 'tok_visa',
    })

    const params = new URL(url).searchParams
    expect(params.get('Token')).toBe('tok_visa')
    expect(params.get('TokenType')).toBe('OCP')
    expect(params.get('HashValue')).toBe(hashValue(signedFields('tok_visa')))
  })
})

const buildResponse = (overrides: Partial<EghlPaymentResponse> = {}): EghlPaymentResponse => {
  const base: EghlPaymentResponse = {
    Amount: '50.00',
    AuthCode: 'AUTH123',
    CurrencyCode: 'MYR',
    HashValue: 'unused',
    HashValue2: '',
    OrderNumber: 'txn_abc123',
    Param6: '',
    Param7: '',
    PaymentID: 'txn_abc123',
    PymtMethod: 'ANY',
    ServiceID: config.serviceId,
    TransactionType: 'SALE',
    TxnID: 'CIVtxn_abc123',
    TxnMessage: 'Transaction Successful',
    TxnStatus: EghlTxnStatus.Success,
  }

  const response = { ...base, ...overrides }

  const signature =
    overrides.HashValue2 ??
    hashValue(
      [
        config.password,
        response.TxnID,
        response.ServiceID,
        response.PaymentID,
        response.TxnStatus,
        response.Amount,
        response.CurrencyCode,
        response.AuthCode,
        response.OrderNumber,
        response.Param6,
        response.Param7,
      ].join(''),
    )

  return { ...response, HashValue2: signature }
}

const hashValueOnlyReply = ({
  TxnExists = EghlTxnExists.NotFound,
  TxnStatus = '-1',
  signatureOverride,
}: { TxnExists?: EghlTxnExists; TxnStatus?: string; signatureOverride?: string } = {}) => {
  const fields = {
    Amount: '50.00',
    AuthCode: '',
    CurrencyCode: 'MYR',
    OrderNumber: '',
    PaymentID: 'txn_abc123',
    PymtMethod: 'ANY',
    QueryDesc: 'Not found',
    ServiceID: config.serviceId,
    TransactionType: 'QUERY',
    TxnExists,
    TxnID: '',
    TxnMessage: '',
    TxnStatus,
  }
  const signature =
    signatureOverride ??
    hashValue(
      [
        config.password,
        fields.TxnID,
        fields.ServiceID,
        fields.PaymentID,
        fields.TxnStatus,
        fields.Amount,
        fields.CurrencyCode,
        fields.AuthCode,
      ].join(''),
    )
  return new URLSearchParams({ ...fields, HashValue: signature }).toString()
}

const existingTransactionReply = (overrides: Partial<EghlPaymentResponse> = {}) => {
  const { HashValue2, ...fields } = buildResponse({
    TransactionType: 'QUERY',
    TxnMessage: 'Transaction Failed',
    TxnStatus: EghlTxnStatus.Failed,
    ...overrides,
  })
  return new URLSearchParams({
    ...fields,
    HashValue2,
    QueryDesc: 'Exists',
    TxnExists: EghlTxnExists.Exists,
  }).toString()
}

const readReturn = (response: EghlPaymentResponse, logger = silent) =>
  createEghlClient(config, logger).readReply(
    new Request(`${expectedReturnURL}?${new URLSearchParams(response).toString()}`),
  )

const queryAgainstGatewayReply = async (body: string, logger = silent) => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() => Promise.resolve(new Response(body, { status: 200 }))),
  )
  try {
    return await createEghlClient(config, logger).queryStatus({
      amountInCents: 5000,
      transactionId: 'txn_abc123',
    })
  } finally {
    vi.unstubAllGlobals()
  }
}

describe('the eGHL client reading replies', () => {
  describe('readReply', () => {
    it('returns what a reply signed by eGHL says, in domain terms', async () => {
      expect.hasAssertions()
      const response = buildResponse()

      expect(okValue(await readReturn(response))).toStrictEqual({
        kind: 'settled',
        outcome: {
          card: null,
          kind: 'succeeded',
          record: {
            amountInCents: 5000,
            currency: 'MYR',
            message: 'Transaction Successful',
            method: 'ANY',
            paidAt: null,
            providerTxnId: 'CIVtxn_abc123',
            transactionId: 'txn_abc123',
          },
        },
      })
    })

    it('logs the status code of a signed reply', async () => {
      expect.hasAssertions()
      const { events, logger } = recordingLogger()

      await readReturn(buildResponse({ TxnStatus: EghlTxnStatus.Failed }), logger)

      expect(events).toMatchObject([
        { event: 'eghl.reply.verified', level: 30, status: '1', transaction_id: 'txn_abc123' },
      ])
    })

    it('logs the names of fields cut to fit, never their values', async () => {
      expect.hasAssertions()
      const { events, logger } = recordingLogger()

      const result = await readReturn(
        buildResponse({ PymtMethod: 'CARD-ONLINE', TxnMessage: 'secret '.repeat(50) }),
        logger,
      )

      expect(okValue(result)).toMatchObject({ kind: 'settled' })
      expect(events).toMatchObject([
        { event: 'eghl.reply.verified' },
        {
          event: 'payment.fields_clipped',
          fields: ['TxnMessage', 'PymtMethod'],
          level: 40,
          transaction_id: 'txn_abc123',
        },
      ])
      expect(JSON.stringify(events)).not.toContain('secret')
    })

    it('settles a signed success whose card fields do not fit, without the card', async () => {
      expect.hasAssertions()
      const { events, logger } = recordingLogger()

      const result = await readReturn(
        buildResponse({
          CardExp: '1299',
          CardNoMask: '411111******1111',
          CardType: 'VISA',
          Token: 'T'.repeat(51),
          TokenType: 'OCP',
        }),
        logger,
      )

      expect(okValue(result)).toMatchObject({ kind: 'settled', outcome: { card: null } })
      expect(events).toMatchObject([
        { event: 'eghl.reply.verified' },
        { event: 'payment.fields_clipped', fields: ['CardExp', 'Token'] },
      ])
    })

    it('rejects the reply when the signature is missing', async () => {
      expect.hasAssertions()
      const response = buildResponse({ HashValue2: '' })

      const result = await readReturn(response)

      expect(result.isErr()).toBe(true)
    })

    it('rejects the reply when the signature does not match', async () => {
      expect.hasAssertions()
      const response = buildResponse({ HashValue2: 'not-valid' })

      const result = await readReturn(response)

      expect(errValue(result)._tag).toBe('EghlVerificationError')
    })

    it('reads a signed reply from a form-encoded POST body', async () => {
      expect.hasAssertions()
      const response = buildResponse()

      const result = await createEghlClient(config, silent).readReply(
        new Request(expectedCallbackURL, {
          body: new URLSearchParams(response).toString(),
          method: 'POST',
        }),
      )

      expect(okValue(result)).toMatchObject({ kind: 'settled' })
    })

    it('rejects a reply that is not a GET or a POST', async () => {
      expect.hasAssertions()

      const result = await createEghlClient(config, silent).readReply(
        new Request(expectedCallbackURL, { method: 'PUT' }),
      )

      expect(errValue(result)._tag).toBe('EghlInvalidMethodError')
    })

    it('rejects a reply that fails the reply schema', async () => {
      expect.hasAssertions()

      const result = await readReturn(buildResponse({ PaymentID: '' }))

      expect(errValue(result)._tag).toBe('ParseError')
    })
  })

  describe('queryStatus', () => {
    it('returns a verified not-found reply that carries only HashValue', async () => {
      expect.hasAssertions()

      const result = await queryAgainstGatewayReply(hashValueOnlyReply())

      expect(okValue(result)).toStrictEqual({ kind: 'notFound' })
    })

    it('rejects a not-found reply whose HashValue does not match', async () => {
      expect.hasAssertions()

      const result = await queryAgainstGatewayReply(
        hashValueOnlyReply({ signatureOverride: 'not-valid' }),
      )

      expect(errValue(result)._tag).toBe('EghlVerificationError')
    })

    it('rejects an existing transaction reply that carries only HashValue', async () => {
      expect.hasAssertions()

      const result = await queryAgainstGatewayReply(
        hashValueOnlyReply({ TxnExists: EghlTxnExists.Exists, TxnStatus: EghlTxnStatus.Failed }),
      )

      expect(result.isErr()).toBe(true)
    })

    it('rejects a reply signed with HashValue only that carries a final status', async () => {
      expect.hasAssertions()

      const result = await queryAgainstGatewayReply(
        hashValueOnlyReply({ TxnStatus: EghlTxnStatus.Failed }),
      )

      expect(result.isErr()).toBe(true)
    })

    it('returns a verified reply for the queried payment and amount', async () => {
      expect.hasAssertions()

      const result = await queryAgainstGatewayReply(existingTransactionReply())

      expect(okValue(result)).toMatchObject({
        kind: 'failed',
        record: { amountInCents: 5000, transactionId: 'txn_abc123' },
      })
    })

    it('answers a verified internal error as a busy gateway', async () => {
      expect.hasAssertions()

      const result = await queryAgainstGatewayReply(
        hashValueOnlyReply({
          TxnExists: EghlTxnExists.InternalError,
          TxnStatus: EghlQueryTxnStatus.InternalError,
        }),
      )

      expect(errValue(result)).toMatchObject({
        _tag: 'EghlGatewayBusyError',
        queryDesc: 'Not found',
      })
    })

    it('logs the status code of a verified answer', async () => {
      expect.hasAssertions()
      const { events, logger } = recordingLogger()

      await queryAgainstGatewayReply(existingTransactionReply(), logger)

      expect(events).toMatchObject([
        {
          event: 'eghl.query.answered',
          level: 30,
          status: '1',
          transaction_id: 'txn_abc123',
          txn_exists: '0',
        },
      ])
    })

    it.each([EghlQueryTxnStatus.Authorized, EghlQueryTxnStatus.Captured])(
      'leaves a sale the gateway reports with status %s pending, and logs it as an error',
      async (TxnStatus) => {
        expect.hasAssertions()
        const { events, logger } = recordingLogger()

        const result = await queryAgainstGatewayReply(
          existingTransactionReply({ TxnStatus } as unknown as Partial<EghlPaymentResponse>),
          logger,
        )

        expect(okValue(result)).toMatchObject({ kind: 'pending' })
        expect(events).toMatchObject([
          { event: 'eghl.query.answered', level: 50, status: TxnStatus },
        ])
      },
    )

    it.each([EghlQueryTxnStatus.Refunded, EghlQueryTxnStatus.Reversed])(
      'reads a signed answer with status %s as refunded, and logs its status code',
      async (TxnStatus) => {
        expect.hasAssertions()
        const { events, logger } = recordingLogger()

        const result = await queryAgainstGatewayReply(
          existingTransactionReply({ TxnStatus } as unknown as Partial<EghlPaymentResponse>),
          logger,
        )

        expect(okValue(result)).toMatchObject({
          kind: 'refunded',
          record: { amountInCents: 5000, transactionId: 'txn_abc123' },
        })
        expect(events).toMatchObject([
          { event: 'eghl.query.answered', level: 30, status: TxnStatus },
        ])
      },
    )

    it('rejects a verified reply for another payment', async () => {
      expect.hasAssertions()

      const result = await queryAgainstGatewayReply(
        existingTransactionReply({ OrderNumber: 'txn_other', PaymentID: 'txn_other' }),
      )

      expect(errValue(result)._tag).toBe('EghlQueryMismatchError')
    })

    it('rejects a verified reply for another amount', async () => {
      expect.hasAssertions()

      const result = await queryAgainstGatewayReply(existingTransactionReply({ Amount: '5.00' }))

      expect(errValue(result)._tag).toBe('EghlQueryMismatchError')
    })
  })
})
