import { createHash } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import { createEghlClient } from './eghl.gateway.server'
import type { EghlPaymentResponse } from './eghl.wire'
import { EghlTxnExists, EghlTxnStatus } from './eghl.wire'

const config = {
  baseUrl: 'https://app.give.test',
  password: 'secret-password',
  serviceId: 'service-123',
  url: 'https://eghl.test/pay',
}

const hashValue = (value: string) => createHash('sha256').update(value).digest('hex')

const expectedReturnURL = `${config.baseUrl}/api/eghl/return`
const expectedCallbackURL = `${config.baseUrl}/api/eghl/callback`

const signedFields = (token: string) =>
  [
    config.password,
    config.serviceId,
    'txn_001',
    expectedReturnURL,
    '',
    '',
    expectedCallbackURL,
    '99.50',
    'MYR',
    '',
    '',
    '',
    token,
    '',
  ].join('')

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

    const url = createEghlClient(config).paymentRequestUrl(request)

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
      PaymentID: 'txn_001',
      ServiceID: config.serviceId,
    })
    expect(params.has('Token')).toBe(false)
    expect(params.get('HashValue')).toBe(hashValue(signedFields('')))
  })

  it('charges a saved card by its token, signing the token too', () => {
    expect.hasAssertions()

    const url = createEghlClient(config).paymentRequestUrl({ ...request, token: 'tok_visa' })

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

const readReturn = (response: EghlPaymentResponse) =>
  createEghlClient(config).readReply(
    new Request(`${expectedReturnURL}?${new URLSearchParams(response).toString()}`),
  )

const queryAgainstGatewayReply = async (body: string) => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() => Promise.resolve(new Response(body, { status: 200 }))),
  )
  try {
    return await createEghlClient(config).queryStatus({
      amountInCents: 5000,
      transactionId: 'txn_abc123',
    })
  } finally {
    vi.unstubAllGlobals()
  }
}

describe('the eGHL client reading replies', () => {
  describe('readReply', () => {
    it('returns the reply when it is signed by eGHL', async () => {
      expect.hasAssertions()
      const response = buildResponse()

      await expect(readReturn(response)).resolves.toMatchObject({ ok: true, value: response })
    })

    it('rejects the reply when the signature is missing', async () => {
      expect.hasAssertions()
      const response = buildResponse({ HashValue2: '' })

      await expect(readReturn(response)).resolves.toMatchObject({ ok: false })
    })

    it('rejects the reply when the signature does not match', async () => {
      expect.hasAssertions()
      const response = buildResponse({ HashValue2: 'not-valid' })

      await expect(readReturn(response)).resolves.toStrictEqual({
        error: { type: 'EghlVerificationError' },
        ok: false,
      })
    })

    it('reads a signed reply from a form-encoded POST body', async () => {
      expect.hasAssertions()
      const response = buildResponse()

      const result = await createEghlClient(config).readReply(
        new Request(expectedCallbackURL, {
          body: new URLSearchParams(response).toString(),
          method: 'POST',
        }),
      )

      expect(result).toMatchObject({ ok: true, value: response })
    })

    it('rejects a reply that is not a GET or a POST', async () => {
      expect.hasAssertions()

      const result = await createEghlClient(config).readReply(
        new Request(expectedCallbackURL, { method: 'PUT' }),
      )

      expect(result).toStrictEqual({ error: { type: 'EghlInvalidMethodError' }, ok: false })
    })

    it('rejects a reply that fails the reply schema', async () => {
      expect.hasAssertions()

      const result = await readReturn(buildResponse({ PaymentID: '' }))

      expect(result).toMatchObject({ error: { type: 'ParseError' }, ok: false })
    })
  })

  describe('queryStatus', () => {
    it('returns a verified not-found reply that carries only HashValue', async () => {
      expect.hasAssertions()

      const result = await queryAgainstGatewayReply(hashValueOnlyReply())

      expect(result).toMatchObject({
        ok: true,
        value: { TxnExists: EghlTxnExists.NotFound, TxnStatus: '-1' },
      })
    })

    it('rejects a not-found reply whose HashValue does not match', async () => {
      expect.hasAssertions()

      const result = await queryAgainstGatewayReply(
        hashValueOnlyReply({ signatureOverride: 'not-valid' }),
      )

      expect(result).toStrictEqual({ error: { type: 'EghlVerificationError' }, ok: false })
    })

    it('rejects an existing transaction reply that carries only HashValue', async () => {
      expect.hasAssertions()

      const result = await queryAgainstGatewayReply(
        hashValueOnlyReply({ TxnExists: EghlTxnExists.Exists, TxnStatus: EghlTxnStatus.Failed }),
      )

      expect(result.ok).toBe(false)
    })

    it('rejects a reply signed with HashValue only that carries a final status', async () => {
      expect.hasAssertions()

      const result = await queryAgainstGatewayReply(
        hashValueOnlyReply({ TxnStatus: EghlTxnStatus.Failed }),
      )

      expect(result.ok).toBe(false)
    })

    it('returns a verified reply for the queried payment and amount', async () => {
      expect.hasAssertions()

      const result = await queryAgainstGatewayReply(existingTransactionReply())

      expect(result).toMatchObject({
        ok: true,
        value: { Amount: '50.00', PaymentID: 'txn_abc123', TxnStatus: EghlTxnStatus.Failed },
      })
    })

    it('rejects a verified reply for another payment', async () => {
      expect.hasAssertions()

      const result = await queryAgainstGatewayReply(
        existingTransactionReply({ OrderNumber: 'txn_other', PaymentID: 'txn_other' }),
      )

      expect(result.ok).toBe(false)
    })

    it('rejects a verified reply for another amount', async () => {
      expect.hasAssertions()

      const result = await queryAgainstGatewayReply(existingTransactionReply({ Amount: '5.00' }))

      expect(result.ok).toBe(false)
    })
  })
})
