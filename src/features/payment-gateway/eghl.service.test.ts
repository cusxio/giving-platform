import { createHash } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import type * as Envvars from '#/envvars'

import type { EghlPaymentResponse } from './eghl.schema'
import { EghlTxnExists, EghlTxnStatus } from './eghl.schema'

const mockedEnv = vi.hoisted(() => ({
  BASE_URL: 'https://app.give.test',
  EGHL_PASSWORD: 'secret-password',
  EGHL_SERVICE_ID: 'service-123',
  EGHL_URL: 'https://eghl.test/pay',
}))

vi.mock<typeof Envvars>(import('#/envvars'), () => mockedEnv)

const { EghlService } = await import('./eghl.service')

const hashValue = (value: string) => createHash('sha256').update(value).digest('hex')

const createService = () => new EghlService()

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
    ServiceID: mockedEnv.EGHL_SERVICE_ID,
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
        mockedEnv.EGHL_PASSWORD,
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
    ServiceID: mockedEnv.EGHL_SERVICE_ID,
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
        mockedEnv.EGHL_PASSWORD,
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

const queryAgainstGatewayReply = async (body: string) => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() => Promise.resolve(new Response(body, { status: 200 }))),
  )
  try {
    return await createService().queryTransactionStatus({
      amountInCents: 5000,
      transactionId: 'txn_abc123',
    })
  } finally {
    vi.unstubAllGlobals()
  }
}

describe('eghlService', () => {
  describe('createPaymentRequestURL', () => {
    it('builds a signed payment request that eGHL accepts', () => {
      expect.hasAssertions()
      const service = createService()

      const url = service.createPaymentRequestURL({
        amountInCents: 9950,
        customerEmail: 'jane@example.com',
        customerName: 'Jane Doe',
        description: 'Giving',
        transactionId: 'txn_001',
      })

      const parsed = new URL(url)
      expect(`${parsed.origin}${parsed.pathname}`).toBe(mockedEnv.EGHL_URL)

      const params = parsed.searchParams
      const expectedReturnURL = `${mockedEnv.BASE_URL}/api/eghl/return`
      const expectedCallbackURL = `${mockedEnv.BASE_URL}/api/eghl/callback`

      expect(Object.fromEntries(params)).toMatchObject({
        Amount: '99.50',
        CurrencyCode: 'MYR',
        CustEmail: 'jane@example.com',
        CustName: 'Jane Doe',
        MerchantCallBackURL: expectedCallbackURL,
        MerchantReturnURL: expectedReturnURL,
        OrderNumber: 'txn_001',
        PaymentID: 'txn_001',
        ServiceID: mockedEnv.EGHL_SERVICE_ID,
      })

      const expectedHash = hashValue(
        [
          mockedEnv.EGHL_PASSWORD,
          mockedEnv.EGHL_SERVICE_ID,
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
          '',
          '',
        ].join(''),
      )

      expect(params.get('HashValue')).toBe(expectedHash)
    })
  })

  describe('verifyPaymentResponse', () => {
    it('returns true when the response is signed by eGHL', () => {
      expect.hasAssertions()
      const service = createService()
      const response = buildResponse()

      expect(service.verifyPaymentResponse(response)).toBe(true)
    })

    it('returns false when the signature is missing', () => {
      expect.hasAssertions()
      const service = createService()
      const response = buildResponse({ HashValue2: '' })

      expect(service.verifyPaymentResponse(response)).toBe(false)
    })

    it('returns false when the signature does not match', () => {
      expect.hasAssertions()
      const service = createService()
      const response = buildResponse({ HashValue2: 'not-valid' })

      expect(service.verifyPaymentResponse(response)).toBe(false)
    })
  })

  describe('queryTransactionStatus', () => {
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
